// Local macOS WebKit qualification host; deliberately no Tauri commands, app
// credentials or persistent data store. Native events are sent to this window
// only. The Node runner owns the loopback production server and the report.
import Cocoa
import WebKit
import os.signpost

final class QAWindow: NSPanel {
    // Only the explicitly requested player mode takes focus. All simulation
    // input is routed in-process and never delivered to another application.
    var playerFocus = false
    override var canBecomeKey: Bool { playerFocus }
    override var canBecomeMain: Bool { playerFocus }
    func sendTestEvent(_ event: NSEvent) { super.sendEvent(event) }
    override func sendEvent(_ event: NSEvent) {
        switch event.type {
        case .keyDown,.keyUp,.flagsChanged,.leftMouseDown,.leftMouseUp,.leftMouseDragged,
             .rightMouseDown,.rightMouseUp,.rightMouseDragged,.otherMouseDown,.otherMouseUp,
             .otherMouseDragged,.mouseMoved,.scrollWheel: return
        default: super.sendEvent(event)
        }
    }
    override func constrainFrameRect(_ rect: NSRect, to screen: NSScreen?) -> NSRect { rect }
}

final class QA: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let origin: URL
    let window: QAWindow
    let web: WKWebView
    let diagnosticOrder: String?
    var nativeSamples = [[String:Any]]()
    var inputRequests = [[String:Any]]()
    var nativeGaps = [Double]()
    var clockTicks = [Double]()
    var clockTimer: Timer?
    let signposts = OSLog(subsystem:"local.tankdelete.qa",category:.pointsOfInterest)
    var lastHostTick: Double = 0
    var lastVisible: Bool?
    var lastFocused: Bool?
    var hostTimer: Timer?
    init(origin: URL, script: String, diagnosticOrder: String? = nil) {
        self.diagnosticOrder = diagnosticOrder
        self.origin = origin
        // Separate physically fitted target. In both modes the page must still
        // prove a 1920x1080 CSS viewport and 1920x1080 real WebGL buffer. The
        // legacy target intentionally remains 1920x1080 AppKit points.
        let player = diagnosticOrder == "player-physical"
        let fitted = diagnosticOrder == "back-physical" || diagnosticOrder == "front-physical" || player
        let scale:CGFloat = fitted ? max(1,NSScreen.main?.backingScaleFactor ?? 1) : 1
        let bounds = NSRect(x: 0, y: 0, width: 1920/scale, height: 1080/scale)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: diagnosticOrder == nil ? .atDocumentEnd : .atDocumentStart, forMainFrameOnly: true))
        self.web = WKWebView(frame: bounds, configuration: config)
        if fitted { self.web.pageZoom = 1/scale }
        self.window = QAWindow(contentRect: bounds, styleMask: player ? [.titled] : [.borderless,.nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        config.userContentController.add(self, name: "simulationQA")
        web.navigationDelegate = self
        window.title = "TankDelete – isolated 1080p WebKit simulation"
        window.contentView = web
        window.setFrameOrigin(.zero)
        window.ignoresMouseEvents = true
        window.hidesOnDeactivate = false
        window.playerFocus = player
        if player {
            // Test actual play focus only in this opt-in mode; a floating
            // nonactivating panel is not the key/main application window.
            window.ignoresMouseEvents = false
            window.level = .floating
            window.collectionBehavior = [.moveToActiveSpace,.fullScreenAuxiliary,.canJoinAllApplications,.ignoresCycle]
            window.center()
            window.orderFrontRegardless()
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps:true)
            DispatchQueue.main.async { [weak self] in self?.window.makeKeyAndOrderFront(nil) }
        } else if diagnosticOrder == "front" || diagnosticOrder == "front-physical" {
            // A normally ordered accessory panel can stay on the previous
            // Space behind a fullscreen application. Move this QA panel only;
            // do not activate the app, switch Spaces or acquire keyboard focus.
            window.level = .floating
            window.collectionBehavior = [.moveToActiveSpace,.fullScreenAuxiliary,.canJoinAllApplications,.ignoresCycle]
            if let screen=NSScreen.main {
                // The Dock can change visibleFrame during the first order-front.
                // Center the panel away from that boundary; never resize the game
                // buffer or alter the display settings to make a fit check pass.
                let usable=screen.visibleFrame
                let center=NSPoint(x:floor(usable.midX-bounds.width/2), y:floor(usable.midY-bounds.height/2))
                window.setFrameOrigin(diagnosticOrder == "front-physical" ? center : screen.frame.origin)
            }
            window.orderFrontRegardless()
            DispatchQueue.main.async { [weak self] in self?.window.orderFrontRegardless() }
        } else {
            if diagnosticOrder == "back-physical", let screen = NSScreen.main {
                // Same native pixels as the fitted player route; only place
                // this test panel, once, behind every normal user window.
                // Keep the inert QA panel eligible on the user's existing
                // Space when Spaces change; never switch or activate one.
                window.collectionBehavior = [.canJoinAllSpaces,.stationary,.ignoresCycle]
                window.setFrameOrigin(screen.visibleFrame.origin)
            }
            window.orderBack(nil)
        }
        if diagnosticOrder != nil {
            recordWindow("start")
            lastHostTick = ProcessInfo.processInfo.systemUptime
            hostTimer = Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { [weak self] _ in
                guard let self = self else { return }
                let now = ProcessInfo.processInfo.systemUptime, gap = (now - self.lastHostTick) * 1000
                if gap >= 180 { self.nativeGaps.append(gap) }
                self.lastHostTick = now
                if self.window.occlusionState.contains(.visible) != self.lastVisible { self.recordWindow("visibility") }
                if player && self.lastFocused != (self.window.isKeyWindow && self.window.isMainWindow && NSApp.isActive) { self.recordWindow("focus") }
            }
        }
        web.load(URLRequest(url: origin))
    }
    func recordWindow(_ label: String) {
        let visible = window.occlusionState.contains(.visible)
        lastVisible = visible
        lastFocused = window.isKeyWindow && window.isMainWindow && NSApp.isActive
        let screen = window.screen?.frame ?? .zero, usable=window.screen?.visibleFrame ?? .zero, surface=web.convertToBacking(web.bounds)
        nativeSamples.append(["stage":label,"epochMs":Date().timeIntervalSince1970*1000,"uptimeMs":ProcessInfo.processInfo.systemUptime*1000,"occlusionVisible":visible,
            "windowVisible":window.isVisible,"key":window.isKeyWindow,"main":window.isMainWindow,"appActive":NSApp.isActive,
            "onActiveSpace":window.isOnActiveSpace,"level":window.level.rawValue,"displayAsleep":CGDisplayIsAsleep(CGMainDisplayID()),
            "backingScale":window.backingScaleFactor,"screen":[screen.origin.x,screen.origin.y,screen.width,screen.height],
            "usableScreen":[usable.origin.x,usable.origin.y,usable.width,usable.height],
            "pageZoom":web.pageZoom,"backingSurface":[surface.width,surface.height],"wholeFrameOnScreen":screen.contains(window.frame),"wholeFrameInUsableScreen":usable.contains(window.frame),
            "frame":[window.frame.origin.x,window.frame.origin.y,window.frame.width,window.frame.height],
            "thermalState":ProcessInfo.processInfo.thermalState.rawValue,"lowPowerMode":ProcessInfo.processInfo.isLowPowerModeEnabled])
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.targetFrame?.isMainFrame == true && navigationAction.request.url == origin ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(["error":"WebKit content process terminated"]) }
    func finish(_ object: [String:Any]) {
        var result = object
        if let order = diagnosticOrder {
            hostTimer?.invalidate(); clockTimer?.invalidate()
            recordWindow("end")
            result["native"] = ["order":order, "samples":nativeSamples, "inputRequests":inputRequests, "hostTimerGapsOver180Ms":nativeGaps,"diagnostic20msTicksUptimeMs":clockTicks]
        }
        if let data = try? JSONSerialization.data(withJSONObject: result) {
            FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
        }
        NSApp.terminate(nil)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.webView === web, message.frameInfo.isMainFrame, web.url == origin,
              let body = message.body as? [String:Any], let op = body["op"] as? String else { return }
        if op == "done", let report = body["report"] as? [String:Any] { finish(report); return }
        if op == "clockSync", diagnosticOrder != nil, let id = body["id"] as? Int, id >= 0, id < 100 {
            if clockTimer == nil {
                // Opt-in diagnostic only; the strict acceptance routes do not send clockSync.
                clockTimer=Timer.scheduledTimer(withTimeInterval:0.020,repeats:true) { [weak self] _ in
                    guard let self=self,self.clockTicks.count<6500 else { return }
                    self.clockTicks.append(ProcessInfo.processInfo.systemUptime*1000)
                }
            }
            let hostMs=ProcessInfo.processInfo.systemUptime*1000
            web.evaluateJavaScript("window.__wkClockReply?.(\(id),\(hostMs))",completionHandler:nil)
            return
        }
        if op == "phase", diagnosticOrder != nil, let label = body["stage"] as? String, nativeSamples.count < 200 {
            if let t=body["browserMs"] as? Double { os_signpost(.event,log:signposts,name:"Game QA", "%{public}@ browser_ms=%{public}.1f",String(label.prefix(32)) as NSString,t) }
            recordWindow(String(label.prefix(32))); return
        }
        guard (op == "click" || op == "move"), let cssX = body["x"] as? Double, let cssY = body["y"] as? Double else { return }
        let x=cssX*web.pageZoom,y=cssY*web.pageZoom
        guard x >= 0 && x < web.bounds.width && y >= 0 && y < web.bounds.height else { return }
        let point = web.convert(NSPoint(x:x, y:web.isFlipped ? y : web.bounds.height-y), to:nil)
        // WK dispatches real platform events via its own content view. Never
        // post global events or move the physical pointer.
        let kinds: [NSEvent.EventType] = op == "move" ? [.mouseMoved] : [.mouseMoved,.leftMouseDown,.leftMouseUp]
        var delivered=0
        for kind in kinds {
            if let event = NSEvent.mouseEvent(with:kind, location:point, modifierFlags:[],
                 timestamp:ProcessInfo.processInfo.systemUptime, windowNumber:window.windowNumber,
                 context:nil, eventNumber:0, clickCount:kind == .mouseMoved ? 0 : 1, pressure:kind == .leftMouseDown ? 1 : 0) {
                window.sendTestEvent(event)
                delivered += 1
            }
        }
        if diagnosticOrder != nil && inputRequests.count < 200 {
            inputRequests.append(["op":op,"x":cssX,"y":cssY,"appKitEventsDispatched":delivered,
                "uptimeMs":ProcessInfo.processInfo.systemUptime*1000,"key":window.isKeyWindow,"main":window.isMainWindow,"appActive":NSApp.isActive])
        }
    }
}

let args = CommandLine.arguments
let diagnosticOrder: String? = args.count == 3 ? args[2] : nil
guard (args.count == 2 || (args.count == 3 && ["front","back","back-physical","front-physical","player-physical"].contains(args[2]))), let url=URL(string:args[1]),
      url.scheme == "http", url.host == "127.0.0.1", let port=url.port, port >= 1024, port != 1420,
      url.path == "/", url.query == nil, url.fragment == nil else { exit(2) }
let program=FileHandle.standardInput.readDataToEndOfFile()
guard !program.isEmpty, let script=String(data:program, encoding:.utf8) else { exit(2) }
let app=NSApplication.shared
// An accessory process can still become active when another app closes.
// The fitted background QA route must never be a candidate for activation.
app.setActivationPolicy(diagnosticOrder == "player-physical" ? .regular : diagnosticOrder == "back-physical" ? .prohibited : .accessory)
let qa=QA(origin:url, script:script, diagnosticOrder:diagnosticOrder)
Timer.scheduledTimer(withTimeInterval:diagnosticOrder?.hasSuffix("-physical") == true ? 145 : 95,repeats:false) { _ in qa.finish(["error":"WebKit route timed out"]) }
app.run()
