// Build and run with scripts/check-cleanup-desk.mjs. No panel, filesystem
// operations, live Trash, host paths or Finder windows are touched.
#import "../src-tauri/src/cleanup_mac.m"
#include <assert.h>
int main(int argc,const char **argv) { @autoreleasepool {
  TDChoice *c=[TDChoice new];
  NSMutableDictionary *d=[@{@"a":c} mutableCopy];
  __block NSInteger commits=0, confirms=0, probes=0;
  BOOL (^valid)(TDChoice *)=^BOOL(TDChoice *x){probes++;return x==c;};
  BOOL (^yes)(TDChoice *)=^BOOL(TDChoice *x){confirms++;return YES;};
  BOOL (^no)(TDChoice *)=^BOOL(TDChoice *x){confirms++;return NO;};
  BOOL (^inertCommit)(TDChoice *)=^BOOL(TDChoice *x){commits++;return x==c;};
  assert([transaction(d,@"not-a-token",valid,yes,inertCommit) isEqual:@"expired"] && !commits && !confirms);
  assert([transaction(d,@"a",valid,no,inertCommit) isEqual:@"cancelled"] && !commits && d[@"a"]);
  probes=0;
  assert([transaction(d,@"a",^BOOL(TDChoice *x){return ++probes==1;},yes,inertCommit) isEqual:@"changed"] && !commits && !d[@"a"]);
  d[@"a"]=c;
  assert([transaction(d,@"a",valid,yes,inertCommit) isEqual:@"trashed"] && commits==1 && !d[@"a"]);
  assert([transaction(d,@"a",valid,yes,inertCommit) isEqual:@"expired"] && commits==1);
  d[@"a"]=c;
  assert([transaction(d,@"a",valid,yes,^BOOL(TDChoice *x){return NO;}) isEqual:@"failed"] && !d[@"a"]);
  struct stat a={0}; a.st_mode=S_IFREG|0644; a.st_uid=getuid();a.st_nlink=1;a.st_ino=12;a.st_size=6;
  struct stat b=a; assert(same(a,b)); b.st_ino++;assert(!same(a,b)); b=a;b.st_nlink=2;assert(!same(a,b));b=a;b.st_ctimespec.tv_nsec++;assert(!same(a,b));
  assert(!safeText(@"ordinary\u202ecod.exe")); assert(!safeText(@"a\nother")); assert(safeText(@"field notes (3).txt"));
  NSDictionary *local=@{NSURLVolumeIsLocalKey:@YES,NSURLVolumeIsInternalKey:@YES,NSURLIsRegularFileKey:@YES,NSURLIsAliasFileKey:@NO};
  assert(localFlags(local,NO)); assert(!localFlags(local,YES)); assert(!localFlags(@{},NO));
  for(NSString *k in local.allKeys){NSMutableDictionary *bad=[local mutableCopy];[bad removeObjectForKey:k];assert(!localFlags(bad,NO));bad[k]=@"unknown";assert(!localFlags(bad,NO));}
  NSMutableDictionary *bad=[local mutableCopy];bad[NSURLIsUbiquitousItemKey]=@YES;assert(!localFlags(bad,NO));
  b=a;b.st_mode=S_IFLNK|0644;assert(!same(a,b));b=a;b.st_mode=S_IFDIR|0644;assert(!same(a,b));
  // Read *only* flags on this temporary test program, never use it as a pick or Trash target.
  NSURL *selfURL=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[0]]];
  NSDictionary *actual=[selfURL resourceValuesForKeys:@[NSURLIsRegularFileKey,NSURLVolumeIsLocalKey,NSURLVolumeIsInternalKey,NSURLIsAliasFileKey,NSURLIsUbiquitousItemKey] error:nil];
  assert(localFlags(actual,[NSFileManager.defaultManager isUbiquitousItemAtURL:selfURL]));
  puts("PASS native inert transaction: unknown ID, cancel, swap after confirmation, exact one-shot success, refusal on replay, OS failure, identity mismatch/hardlink and display-spoof rejects. No real files selected or moved.");
} }
