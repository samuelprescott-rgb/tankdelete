// Local workshop only. Install public WebKit resource rules before creating any
// page. Failure to compile them is a startup failure, never an unfiltered retry.
#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>

void *td_workshop_filtered_configuration(void) {
    if (![NSThread isMainThread]) return NULL;
    @autoreleasepool {
        NSString *rules = @"[{\"trigger\":{\"url-filter\":\"^https?://\"},\"action\":{\"type\":\"block\"}},"
          "{\"trigger\":{\"url-filter\":\"^wss?://\"},\"action\":{\"type\":\"block\"}},"
          "{\"trigger\":{\"url-filter\":\"^ftp://\"},\"action\":{\"type\":\"block\"}},"
          "{\"trigger\":{\"url-filter\":\"^file:\"},\"action\":{\"type\":\"block\"}}]";
        __block WKContentRuleList *ruleset = nil;
        __block BOOL finished = NO;
        [[WKContentRuleListStore defaultStore] compileContentRuleListForIdentifier:@"tankdelete-offline-v1"
           encodedContentRuleList:rules completionHandler:^(WKContentRuleList *compiled, NSError *error) {
              ruleset = error ? nil : compiled;
              finished = YES;
           }];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
        while (!finished && [deadline timeIntervalSinceNow] > 0)
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
        if (!finished || !ruleset) return NULL;
        WKWebViewConfiguration *config = [WKWebViewConfiguration new];
        [config.userContentController addContentRuleList:ruleset];
        config.allowsAirPlayForMediaPlayback = NO;
        config.preferences.javaScriptCanOpenWindowsAutomatically = NO;
        return (__bridge_retained void *)config;
    }
}
