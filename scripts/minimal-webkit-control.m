// Third and final native isolation probe: AppKit text and a trivial WKWebView
// sharing a window, no Tauri, Rust, game, filesystem bridge, credentials or URL.
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
@interface Probe:NSObject<NSApplicationDelegate,WKNavigationDelegate>
@property(nonatomic,strong) NSWindow *window;
@property(nonatomic,strong) WKWebView *web;
@end
@implementation Probe
-(void)applicationDidFinishLaunching:(NSNotification *)note{
 self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,820,470) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
 self.window.title=@"TankDelete / isolated native renderer check";[self.window center];
 NSTextField *label=[NSTextField labelWithString:@"Native window ready"];
 label.font=[NSFont boldSystemFontOfSize:24];label.frame=NSMakeRect(20,415,780,38);[self.window.contentView addSubview:label];
 WKWebViewConfiguration *cfg=[WKWebViewConfiguration new];cfg.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
 self.web=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,820,400) configuration:cfg];self.web.navigationDelegate=self;
 [self.window.contentView addSubview:self.web];
 [self.web loadHTMLString:@"<html><body style='background:#182d29;color:white;padding:30px;font:24px system-ui'><h1>Web content ready</h1><p>Offline document</p></body></html>" baseURL:nil];
 [self.window orderFront:nil];
}
@end
int main(){@autoreleasepool{[NSApplication sharedApplication];Probe *p=[Probe new];NSApp.delegate=p;[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];[NSApp run];return 0;}}
