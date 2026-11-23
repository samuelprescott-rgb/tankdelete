// Run only against a newly built local review app. Read only the launched
// process' accessibility tree and, when existing permissions allow, its ONE
// window. Never posts input, asks for accessibility/screen permission, uses a
// picker, captures the desktop, or inspects some other player's game.
import AppKit
import ApplicationServices
import Vision
import ImageIO

func wait(_ seconds:TimeInterval) { RunLoop.current.run(until:Date(timeIntervalSinceNow:seconds)) }
let args=CommandLine.arguments
let fixture=args.count==4 && args[3]=="--isolated-fixture"
guard args.count==3||fixture else {exit(64)}
let url=URL(fileURLWithPath:args[1]).standardizedFileURL, out=URL(fileURLWithPath:args[2],isDirectory:true)
guard url.pathExtension=="app",url.path.contains("/local-mac-"),let expected=Bundle(url:url)?.bundleIdentifier,expected.hasPrefix("local.tankdelete.workshop.") else {exit(65)}
let config=NSWorkspace.OpenConfiguration();config.activates=false;config.createsNewApplicationInstance=true;config.addsToRecentItems=false
var app:NSRunningApplication?,launchIssue:String?
NSWorkspace.shared.openApplication(at:url,configuration:config){a,e in app=a;launchIssue=e?.localizedDescription}
let launchEnd=Date(timeIntervalSinceNow:12)
while app==nil && launchIssue==nil && Date()<launchEnd {wait(0.15)}
guard let running=app, running.bundleIdentifier==expected,
      running.bundleURL?.standardizedFileURL.path==url.path else {print("Launch failed or wrong app: "+(launchIssue ?? "no matching owner"));exit(2)}
let pid=running.processIdentifier,root=AXUIElementCreateApplication(pid),ax=AXIsProcessTrusted(),canCapture=CGPreflightScreenCaptureAccess()
func attr(_ el:AXUIElement,_ key:String)->CFTypeRef?{var value:CFTypeRef?;return AXUIElementCopyAttributeValue(el,key as CFString,&value) == .success ? value:nil}
func visibleText()->String{
  guard ax else {return ""}; var strings:[String]=[],todo=[root],count=0
  while !todo.isEmpty&&count<900 {let el=todo.removeFirst();count+=1
    for key in [kAXTitleAttribute,kAXDescriptionAttribute,kAXValueAttribute] {if let value=attr(el,key as String) as? String{strings.append(String(value.prefix(500)))}}
    if let children=attr(el,kAXChildrenAttribute as String) as? [AXUIElement]{todo.append(contentsOf:children.prefix(80))}
  }; return strings.joined(separator:" ").lowercased()
}
func ownedWindow()->CGWindowID?{
  guard let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] else{return nil}
  return windows.first{($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid&&($0[kCGWindowLayer as String] as? NSNumber)?.intValue==0}.flatMap{($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value}
}
func recognizeOwned(_ id:CGWindowID,_ dst:URL)->String{
  guard canCapture else{return ""}; let cap=Process();cap.executableURL=URL(fileURLWithPath:"/usr/sbin/screencapture");cap.arguments=["-x","-o","-l",String(id),dst.path]
  do{try cap.run();cap.waitUntilExit();guard cap.terminationStatus==0 else{return ""}
    guard let src=CGImageSourceCreateWithURL(dst as CFURL,nil),let thumb=CGImageSourceCreateThumbnailAtIndex(src,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:2560] as CFDictionary)else{return ""}
    let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate;request.recognitionLanguages=["en-US"];request.usesCPUOnly=true;try VNImageRequestHandler(cgImage:thumb).perform([request])
    return (request.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:" ").lowercased()
  }catch{return ""}
}
let menu=fixture ? ["native window ready","web content ready","offline document"] : ["start campaign","cleanup desk","boot camp"],began=Date(),end=Date(timeIntervalSinceNow:28)
var seen=Set<String>(),windowID:CGWindowID?,captures=0
while !running.isTerminated && Date()<end && seen.count<menu.count {
  let text=visibleText();menu.filter{text.contains($0)}.forEach{seen.insert($0)}
  if let id=ownedWindow(){windowID=id
    if canCapture && captures<3 && Date().timeIntervalSince(began)>[3.0,9.0,18.0][captures] {
      let words=recognizeOwned(id,out.appendingPathComponent("native-menu-\(captures).png")); captures+=1
      menu.filter{words.contains($0)}.forEach{seen.insert($0)}
    }
  };wait(0.5)
}
let closed=running.isTerminated
var proof:[String:Any]=["id":expected,"pid":pid,"accessibilityGranted":ax,"screenCaptureAlreadyGranted":canCapture,
  "artifact":fixture ? "isolated WebKit control (not the game)" : "signed TankDelete package",
  "windowID":windowID ?? 0,"menuItemsProved":Array(seen).sorted(),"pass":seen.count==menu.count,
  "wasTerminated":closed,"capturesOfOwnedWindowOnly":captures,"sampleInput":false,"realFileOperations":0]
if !closed {proof["askedOwnedProcessToClose"]=running.terminate()}
let json=try JSONSerialization.data(withJSONObject:proof,options:[.prettyPrinted,.sortedKeys]);try json.write(to:out.appendingPathComponent("native-menu.json"),options:.withoutOverwriting)
print(String(decoding:json,as:UTF8.self));exit(seen.count==menu.count ? 0 : 3)
