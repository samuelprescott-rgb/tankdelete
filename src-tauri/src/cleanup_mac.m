// The only host-file boundary. User choices and metadata live in RAM and are
// deliberately not bookmarks, logs, paths accepted over IPC, or directory scans.
#import <AppKit/AppKit.h>
#include <fcntl.h>
#include <pwd.h>
#include <sys/stat.h>
#include <unistd.h>

@interface TDChoice : NSObject
@property(nonatomic,copy) NSString *token;
@property(nonatomic,strong) NSURL *selected, *reference;
@property(nonatomic) int fd;
@property(nonatomic) BOOL scoped;
@property(nonatomic) struct stat original;
@end
@implementation TDChoice
-(instancetype)init { self=[super init]; if(self) _fd=-1; return self; }
-(void)dealloc { if(_fd>=0) close(_fd); if(_scoped) [_selected stopAccessingSecurityScopedResource]; }
@end
static NSMutableDictionary<NSString *,TDChoice *> *choices;
static BOOL busy;

static BOOL same(struct stat a, struct stat b) {
    return S_ISREG(a.st_mode) && S_ISREG(b.st_mode) && a.st_uid==getuid() && b.st_uid==getuid()
      && a.st_nlink==1 && b.st_nlink==1 && a.st_mode==b.st_mode && a.st_dev==b.st_dev
      && a.st_ino==b.st_ino && a.st_gen==b.st_gen && a.st_size==b.st_size
      && a.st_ctimespec.tv_sec==b.st_ctimespec.tv_sec && a.st_ctimespec.tv_nsec==b.st_ctimespec.tv_nsec;
}
static BOOL safeText(NSString *s) {
    if(!s.length || [s rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location!=NSNotFound) return NO;
    // Prevent visually reordered, invisible or multiline paths in the consent sheet.
    NSCharacterSet *hidden=[NSCharacterSet characterSetWithCharactersInString:@"\u061c\u200b\u200c\u200d\u200e\u200f\u2028\u2029\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff"];
    return [s rangeOfCharacterFromSet:hidden].location==NSNotFound;
}
static BOOL flagIs(NSDictionary *flags,NSString *key,BOOL expected) {
    id val=flags[key];
    return [val isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)val)==CFBooleanGetTypeID() && [val boolValue]==expected;
}
static BOOL localFlags(NSDictionary *flags,BOOL isUbiquitous) {
    // macOS commonly omits NSURLIsUbiquitousItemKey for ordinary local files.
    // For that key alone use NSFileManager's explicit membership query. Never
    // coerce an undeclared alias, volume, regularity or invalid metadata to NO.
    id ubi=flags[NSURLIsUbiquitousItemKey];
    return flagIs(flags,NSURLIsRegularFileKey,YES) && flagIs(flags,NSURLVolumeIsLocalKey,YES)
      && flagIs(flags,NSURLVolumeIsInternalKey,YES) && flagIs(flags,NSURLIsAliasFileKey,NO)
      && !isUbiquitous && (!ubi || ubi==NSNull.null || flagIs(flags,NSURLIsUbiquitousItemKey,NO));
}
static BOOL eligible(NSURL *url) {
    struct passwd *user=getpwuid(getuid());
    if(!user || !url.isFileURL || !safeText(url.path)) return NO;
    NSString *home=[NSString stringWithUTF8String:user->pw_dir];
    if(!home || ![url.path isEqual:url.URLByStandardizingPath.path] || ![url.path hasPrefix:[home stringByAppendingString:@"/"]]) return NO;
    NSArray<NSString *> *parts=[[url.path substringFromIndex:home.length+1] componentsSeparatedByString:@"/"];
    if(parts.count<2 || ![@[@"Downloads",@"Documents",@"Desktop"] containsObject:parts.firstObject]) return NO;
    // A replaced parent must not launder a symlink, package, or hidden directory.
    NSString *p=home;
    for(NSUInteger i=0;i<parts.count;i++) {
        NSString *part=parts[i];
        if(!part.length || [part hasPrefix:@"."]) return NO;
        p=[p stringByAppendingPathComponent:part];
        struct stat info={0};
        if(lstat(p.fileSystemRepresentation,&info)!=0 || S_ISLNK(info.st_mode) || info.st_uid!=getuid()
            || (info.st_flags & (UF_HIDDEN|UF_IMMUTABLE|SF_IMMUTABLE|SF_DATALESS))) return NO;
        if(i+1<parts.count && (!S_ISDIR(info.st_mode) || (info.st_mode & (S_IWGRP|S_IWOTH))
                || [NSWorkspace.sharedWorkspace isFilePackageAtPath:p])) return NO;
        if(i+1==parts.count && (!S_ISREG(info.st_mode)||info.st_nlink!=1||(info.st_mode & (S_ISUID|S_ISGID|0111)))) return NO;
    }
    NSDictionary *flags=[url resourceValuesForKeys:@[NSURLVolumeIsLocalKey,NSURLVolumeIsInternalKey,NSURLIsAliasFileKey,NSURLIsRegularFileKey,NSURLIsUbiquitousItemKey] error:nil];
    return localFlags(flags,[NSFileManager.defaultManager isUbiquitousItemAtURL:url]);
}
static BOOL current(TDChoice *choice) {
    struct stat fdInfo={0}, pathInfo={0};
    if(!eligible(choice.selected) || ![choice.reference.filePathURL.path isEqual:choice.selected.path]) return NO;
    return fstat(choice.fd,&fdInfo)==0 && lstat(choice.selected.fileSystemRepresentation,&pathInfo)==0
      && same(choice.original,fdInfo) && same(choice.original,pathInfo);
}
static NSString *receipt(NSDictionary *object) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"{}";
}
static char *onMain(NSString *(^op)(void)) {
    __block NSString *out=nil;
    void (^run)(void)=^{ @autoreleasepool {out=op();} };
    if(NSThread.isMainThread) run(); else dispatch_sync(dispatch_get_main_queue(),run);
    return strdup(out.UTF8String ?: "{}");
}
void td_cleanup_free(char *result) {free(result);}
void td_cleanup_forget(void) {
    void (^clear)(void)=^{ if(!busy) choices=nil; };
    if(NSThread.isMainThread) clear(); else dispatch_sync(dispatch_get_main_queue(),clear);
}
char *td_cleanup_pick(void) {
    return onMain(^NSString *{
        if(busy) return @"{\"status\":\"busy\"}";
        busy=YES;
        @try {
            choices=[NSMutableDictionary dictionary];
            NSOpenPanel *panel=NSOpenPanel.openPanel;
            panel.canChooseFiles=YES; panel.canChooseDirectories=NO; panel.allowsMultipleSelection=YES;
            panel.resolvesAliases=NO; panel.treatsFilePackagesAsDirectories=NO; panel.showsHiddenFiles=NO;
            panel.prompt=@"Use these files"; panel.title=@"Choose files for TankDelete";
            panel.message=@"Choose up to 12 ordinary files inside Desktop, Documents or Downloads. Shots only make a shortlist. Nothing moves without a separate, per-file macOS confirmation.";
            if([panel runModal]!=NSModalResponseOK) return @"{\"status\":\"cancelled\"}";
            if(!panel.URLs.count || panel.URLs.count>12) return @"{\"status\":\"ineligible\"}";
            NSMutableArray *rows=[NSMutableArray array];
            for(NSURL *url in panel.URLs) {
                TDChoice *c=[TDChoice new]; c.selected=url; c.scoped=[url startAccessingSecurityScopedResource];
                if(!eligible(url)) { choices=nil; return @"{\"status\":\"ineligible\"}"; }
                c.fd=open(url.fileSystemRepresentation,O_EVTONLY|O_NOFOLLOW|O_CLOEXEC);
                struct stat original={0};
                if(c.fd<0 || fstat(c.fd,&original)!=0) { choices=nil; return @"{\"status\":\"ineligible\"}"; }
                c.original=original; c.reference=url.fileReferenceURL; c.token=NSUUID.UUID.UUIDString;
                if(!current(c)) {choices=nil; return @"{\"status\":\"ineligible\"}";}
                choices[c.token]=c;
                [rows addObject:@{@"id":c.token,@"name":url.lastPathComponent,@"path":url.path,@"size":@(original.st_size)}];
            }
            return receipt(@{@"status":@"picked",@"files":rows});
        } @finally { busy=NO; }
    });
}

// Pure transaction ordering, shared by production and the adversarial, inert
// native test. Even after native consent the moving backend must revalidate
// inside its coordinator; an ID is spent before a move is attempted.
static NSString *transaction(NSMutableDictionary *allow, NSString *token,
    BOOL (^fresh)(TDChoice *), BOOL (^consent)(TDChoice *), BOOL (^commit)(TDChoice *)) {
    TDChoice *choice=allow[token];
    if(!choice) return @"expired";
    if(!fresh(choice)) { [allow removeObjectForKey:token]; return @"changed"; }
    if(!consent(choice)) return @"cancelled";
    [allow removeObjectForKey:token];
    if(!fresh(choice)) return @"changed";
    return commit(choice) ? @"trashed" : @"failed";
}
static NSAlert *confirmation(NSString *path, long long bytes) {
    NSAlert *alert=[NSAlert new];
    alert.alertStyle=NSAlertStyleWarning; alert.messageText=@"Move this one file to the Mac Trash?";
    alert.informativeText=[NSString stringWithFormat:@"%lld bytes. Check the exact path below. Restore it with Put Back in Finder’s Trash. This is a real file, not a campaign target.",bytes];
    NSScrollView *scroll=[[NSScrollView alloc] initWithFrame:NSMakeRect(0,0,440,78)];
    scroll.hasVerticalScroller=YES; scroll.borderType=NSBezelBorder;
    NSTextView *field=[[NSTextView alloc] initWithFrame:NSMakeRect(0,0,420,78)];
    field.editable=NO; field.selectable=YES; field.horizontallyResizable=NO; field.verticallyResizable=YES;
    field.autoresizingMask=NSViewWidthSizable;
    field.textContainer.widthTracksTextView=YES;
    field.font=[NSFont userFixedPitchFontOfSize:12];
    field.string=path; field.accessibilityLabel=@"Full selected file path"; scroll.documentView=field;
    alert.accessoryView=scroll;
    NSButton *cancel=[alert addButtonWithTitle:@"Keep file"];
    [alert addButtonWithTitle:@"Move to Trash"];
    // Keyboard Return, Escape, and a dismissed dialog cannot consent.
    cancel.keyEquivalent=@"\r"; alert.buttons[1].keyEquivalent=@"";
    return alert;
}
char *td_cleanup_review(const char *token) {
    NSString *key=[NSString stringWithUTF8String:token];
    return onMain(^NSString *{
        if(busy) return @"busy";
        busy=YES;
        @try {
            return transaction(choices,key,^BOOL(TDChoice *c){return current(c);},^BOOL(TDChoice *c){
                NSAlert *alert=confirmation(c.selected.path,(long long)c.original.st_size);
                return [alert runModal]==NSAlertSecondButtonReturn;
            },^BOOL(TDChoice *c){
                NSFileCoordinator *coord=[[NSFileCoordinator alloc] initWithFilePresenter:nil];
                __block BOOL moved=NO;
                NSError *error=nil;
                [coord coordinateWritingItemAtURL:c.selected options:NSFileCoordinatorWritingForDeleting error:&error byAccessor:^(NSURL *coordinated){
                    if(![coordinated.path isEqual:c.selected.path] || !current(c)) return;
                    // Use an identity-bound file reference, not an arbitrary path
                    // passed by JS. The sole mutation API is system Trash, with
                    // no direct remove, replacement, or permanent-delete fallback.
                    moved=[NSFileManager.defaultManager trashItemAtURL:c.reference resultingItemURL:nil error:nil];
                }];
                return moved && !error;
            });
        } @finally {busy=NO;}
    });
}
