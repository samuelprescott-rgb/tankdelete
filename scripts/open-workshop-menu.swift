// Normal play handoff after embedded-content and two-strike qualification.
// No launch switches, test navigation, synthetic input, file picker, or Trash.
import AppKit
import CoreGraphics
import Foundation
import CryptoKit

func fail(_ detail:String)->Never {fputs(detail+"\n",stderr);exit(1)}
let a=CommandLine.arguments
guard a.count==3 else {fail("Expected packaged directory and native two-strike receipt")}
func read(_ url:URL)->[String:Any] {
  guard let bytes=try? Data(contentsOf:url),let obj=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any] else {fail("Unreadable QA receipt")}
  return obj
}
let dir=URL(fileURLWithPath:a[1],isDirectory:true).standardizedFileURL
guard dir.path.contains("/tankdelete/tmp/production-qa/local-mac-") else {fail("Not a local test package")}
let p=read(dir.appendingPathComponent("package.json")),embedded=read(dir.appendingPathComponent("embedded-content.json")),strike=read(URL(fileURLWithPath:a[2]))
guard let path=p["app"] as? String,let id=p["id"] as? String,id.hasPrefix("local.tankdelete.workshop."),
  embedded["pass"] as? Bool==true,embedded["app"] as? String==path,
  let checks=strike["checks"] as? [String:Bool],!checks.isEmpty,checks.values.allSatisfy({$0}),
  (strike["presentation"] as? [String:Any])?["verifiedPhysical1080"] as? Bool==true,
  let art=strike["artifact"] as? [String:String],art.keys.contains("index.html"),
  art.keys.contains(where:{$0.hasPrefix("assets/GameSession-") && $0.hasSuffix(".js")}),
  let dist=embedded["dist"] as? String,dist==p["dist"] as? String else {fail("Not a verified package of a physically qualified strike build")}
let frozen=URL(fileURLWithPath:dist,isDirectory:true).standardizedFileURL
for (rel,digest) in art {
  let payload=frozen.appendingPathComponent(rel).standardizedFileURL
  guard payload.path.hasPrefix(frozen.path+"/"),let data=try? Data(contentsOf:payload),
    SHA256.hash(data:data).map({String(format:"%02x",$0)}).joined()==digest else {fail("Strike receipt does not match embedded frozen release: "+rel)}
}
let url=URL(fileURLWithPath:path).standardizedFileURL
guard url.deletingLastPathComponent().path==dir.path,url.pathExtension=="app",Bundle(url:url)?.bundleIdentifier==id else {fail("Wrong native app")}
let cfg=NSWorkspace.OpenConfiguration();cfg.activates=true;cfg.createsNewApplicationInstance=true;cfg.addsToRecentItems=false;cfg.arguments=[]
var app:NSRunningApplication?,issue:String?
NSWorkspace.shared.openApplication(at:url,configuration:cfg){ap,err in app=ap;issue=err?.localizedDescription}
let end=Date(timeIntervalSinceNow:22);var win:CGWindowID?,first=Date.distantFuture
while Date()<end && issue==nil {
  RunLoop.current.run(until:Date(timeIntervalSinceNow:0.15))
  if let ap=app,ap.bundleURL?.standardizedFileURL.path==url.path,!ap.isTerminated,
     let list=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]],
     let info=list.first(where:{($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==ap.processIdentifier && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue==0}),
     let n=info[kCGWindowNumber as String] as? NSNumber {
    if win==nil {first=Date()};win=n.uint32Value
    if Date().timeIntervalSince(first)>4.0 {break}
  }
}
guard let game=app,!game.isTerminated,let window=win,Date().timeIntervalSince(first)>4 else {fail(issue ?? "Normal game window not confirmed")}
let receipt:[String:Any]=["app":path,"pid":game.processIdentifier,"window":window,"launchArguments":[],"observedSeconds":Date().timeIntervalSince(first),"measuredStrike":a[2],"active":game.isActive]
let data=try JSONSerialization.data(withJSONObject:receipt,options:[.prettyPrinted,.sortedKeys])
try data.write(to:dir.appendingPathComponent("normal-play-handoff.json"),options:.withoutOverwriting)
print("Normal player window verified: "+String(game.processIdentifier));fflush(stdout)
while !game.isTerminated {RunLoop.current.run(until:Date(timeIntervalSinceNow:1))}
