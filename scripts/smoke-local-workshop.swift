// Launch precisely one known local package. The optional, in-app smoke flag
// checks the real React menu, clicks only "Cleanup Desk", then checks the desk.
// No accessibility grant, desktop capture, file picker or Trash operation.
import AppKit
import CoreGraphics
import Foundation
import Darwin

let args = CommandLine.arguments
guard args.count == 2 || (args.count == 3 && args[2] == "--leave-at-desk") else {exit(64)}
let handoff = args.count==3, stem=handoff ? "workshop-handoff" : "workshop"
let out = URL(fileURLWithPath:args[1],isDirectory:true).standardizedFileURL
guard out.path.contains("/tankdelete/tmp/production-qa/local-mac-") else {exit(65)}
guard !FileManager.default.fileExists(atPath:out.appendingPathComponent(stem+"-boot.json").path) else {exit(68)}
let raw = try Data(contentsOf:out.appendingPathComponent("package.json"))
let receipt = try JSONSerialization.jsonObject(with:raw) as? [String:Any]
guard let path = receipt?["app"] as? String, let id = receipt?["id"] as? String,
    receipt?["offlineWebview"] != nil, id.hasPrefix("local.tankdelete.workshop.") else {exit(66)}
let url = URL(fileURLWithPath:path).standardizedFileURL
guard url.deletingLastPathComponent().standardizedFileURL.path == out.path,
    url.pathExtension == "app", Bundle(url:url)?.bundleIdentifier == id else {exit(67)}
// An ephemeral observer bound ONLY to 127.0.0.1. Prove it can accept one
// connection from our own test, then count (without reading) unexpected
// connections from the bundled page's deliberately denied URL probes.
let listener=socket(AF_INET,SOCK_STREAM,0)
var address=sockaddr_in();address.sin_len=UInt8(MemoryLayout<sockaddr_in>.size)
address.sin_family=sa_family_t(AF_INET);address.sin_addr.s_addr=inet_addr("127.0.0.1")
func addr<T>(_ work:(UnsafeMutablePointer<sockaddr>,socklen_t)->T)->T {
    withUnsafeMutablePointer(to:&address){$0.withMemoryRebound(to:sockaddr.self,capacity:1){work($0,socklen_t(MemoryLayout<sockaddr_in>.size))}}
}
guard listener>=0, addr({Darwin.bind(listener,$0,$1)})==0, listen(listener,8)==0 else {exit(69)}
var alen=socklen_t(MemoryLayout<sockaddr_in>.size)
guard addr({p,_ in getsockname(listener,p,&alen)})==0 else {exit(69)}
let port=UInt16(bigEndian:address.sin_port), selfCheck=socket(AF_INET,SOCK_STREAM,0)
guard port>=1024,selfCheck>=0,addr({Darwin.connect(selfCheck,$0,$1)})==0 else {exit(69)}
let loopbackCheck=accept(listener,nil,nil);guard loopbackCheck>=0 else {exit(69)}
close(selfCheck);close(loopbackCheck)
guard fcntl(listener,F_SETFL,O_NONBLOCK)==0 else {exit(69)}
defer {close(listener)}
var attemptedConnections=0
func countConnections(){while true {let fd=accept(listener,nil,nil);if fd<0{return};attemptedConnections+=1;close(fd)}}
let config = NSWorkspace.OpenConfiguration(); config.arguments=["--verify-cleanup-desk","--workshop-probe-port="+String(port)]
config.activates=handoff;config.addsToRecentItems=false;config.createsNewApplicationInstance=true
var app:NSRunningApplication?, launchIssue:String?
NSWorkspace.shared.openApplication(at:url,configuration:config){result,error in app=result;launchIssue=error?.localizedDescription}
func tick(){RunLoop.current.run(until:Date(timeIntervalSinceNow:0.16))}
let launchLimit=Date(timeIntervalSinceNow:12)
while app==nil && launchIssue==nil && Date()<launchLimit {tick()}
guard let running=app,running.bundleIdentifier==id,running.bundleURL?.standardizedFileURL.path==path else {
    print("No matching local package: "+(launchIssue ?? "missing process"));exit(2)
}
let pid=running.processIdentifier, canCapture=CGPreflightScreenCaptureAccess()
var states:[String]=[],captures:[String]=[],windowID:CGWindowID?,policyBits=""
func ownedWindow()->(CGWindowID,String)?{
    guard let list=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]],
        let win=list.first(where:{($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid &&
            ($0[kCGWindowLayer as String] as? NSNumber)?.intValue==0}),
        let n=win[kCGWindowNumber as String] as? NSNumber else{return nil}
    return (n.uint32Value,win[kCGWindowName as String] as? String ?? "")
}
let limit=Date(timeIntervalSinceNow:45)
while !running.isTerminated && Date()<limit && policyBits.isEmpty {
    countConnections()
    if let (win,title)=ownedWindow(){
        windowID=win
        if title.hasPrefix("TankDelete policy "){let bits=String(title.dropFirst("TankDelete policy ".count));if bits.count==8 && bits.allSatisfy({$0=="0" || $0=="1"}){policyBits=bits}}
        if (states.isEmpty && title=="TankDelete · menu verified") || (states==["menu"] && title=="TankDelete · desk verified") {
            let name=states.isEmpty ? "menu":"desk";states.append(name)
            if canCapture {
                let cap=Process(), dest=out.appendingPathComponent(stem+"-"+name+".png")
                cap.executableURL=URL(fileURLWithPath:"/usr/sbin/screencapture")
                cap.arguments=["-x","-o","-l",String(win),dest.path]
                if !FileManager.default.fileExists(atPath:dest.path), (try? cap.run()) != nil {
                    cap.waitUntilExit();if cap.terminationStatus==0{captures.append(dest.lastPathComponent)}
                }
            }
        }
    }
    tick()
}
countConnections()
let evidence=Array(policyBits).map{$0=="1"}
let pass=states==["menu","desk"] && !running.isTerminated && policyBits.hasPrefix("11111") && attemptedConnections==0
let keep=pass && handoff
if !keep && !running.isTerminated {_=running.terminate()}
let proof:[String:Any]=["id":id,"app":path,"binarySha256":receipt?["binarySha256"] as? String ?? "",
  "pid":pid,"windowID":windowID ?? 0,"statesInOrder":states,"pass":pass,"ownedWindowImages":captures,
  "verification":"The OS-owned window title supplies ordered real React menu/desk states; separate policy checks never open a file.",
  "webContentPolicyChecks":Dictionary(uniqueKeysWithValues:zip(["servedHtmlHeaderMatchesBundledOnlyPolicy","fetchRejected","imageRejected","websocketRejected","iframeAttempted","connectDirectiveEvent","imgDirectiveEvent","frameDirectiveEvent"],evidence)),
  "loopbackObserver":["positiveControlAccepted":true,"probeTcpConnections":attemptedConnections],
  "systemInput":false,"filePickerOpened":false,"realFilesSelected":0,"trashOperations":0,"leftRunningAtDesk":keep]
let json=try JSONSerialization.data(withJSONObject:proof,options:[.prettyPrinted,.sortedKeys])
try json.write(to:out.appendingPathComponent(stem+"-boot.json"),options:.withoutOverwriting)
print(String(decoding:json,as:UTF8.self));exit(pass ? 0:3)
