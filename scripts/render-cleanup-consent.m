// Render the production confirmation view OFFSCREEN, with fabricated text.
// No file is picked, inspected, opened, moved or trashed by this harness.
#import "../src-tauri/src/cleanup_mac.m"
#include <assert.h>
int main(int argc,char **argv) { @autoreleasepool {
  assert(argc==2); [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
  NSString *path=@"/Users/Fictional/Desktop/Sample project/Review only/field-notes.txt";
  NSApp.appearance=[NSAppearance appearanceNamed:NSAppearanceNameAqua];
  NSAlert *alert=confirmation(path,4096);
  [alert layout];
  assert([alert.buttons.firstObject.title isEqual:@"Keep file"] && [alert.buttons.firstObject.keyEquivalent isEqual:@"\r"] && !alert.buttons[1].keyEquivalent.length);
  NSScrollView *scroll=(NSScrollView *)alert.accessoryView;
  NSTextView *field=(NSTextView *)scroll.documentView;
  assert([field.string isEqual:path] && !field.isEditable && field.isSelectable && scroll.hasVerticalScroller);
  NSView *view=alert.window.contentView;
  [view layoutSubtreeIfNeeded];CGRect bounds=view.bounds;
  NSBitmapImageRep *bitmap=[view bitmapImageRepForCachingDisplayInRect:bounds];
  [view cacheDisplayInRect:bounds toBitmapImageRep:bitmap];
  // cacheDisplay omits the compositor's material backing. Place the genuine
  // transparent pixels over an opaque Aqua backplate, not desktop pixels.
  NSBitmapImageRep *opaque=[[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:bitmap.pixelsWide pixelsHigh:bitmap.pixelsHigh bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  opaque.size=bitmap.size; [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:opaque]];
  [[NSColor colorWithWhite:.94 alpha:1] setFill]; NSRectFill(bounds); [bitmap drawInRect:bounds fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:NO hints:nil];[NSGraphicsContext restoreGraphicsState];
  NSData *png=[opaque representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
  NSString *out=[NSString stringWithUTF8String:argv[1]];
  assert(png.length>3000);assert([png writeToFile:out options:NSDataWritingWithoutOverwriting error:nil]);
  // Optional read-only round-trip on the image we JUST generated (never a
  // supplied/selected personal file). No picker, file bytes or mover used.
  NSURL *fixture=[NSURL fileURLWithPath:out];
  if([fixture.path containsString:@"/tankdelete/tmp/production-qa/native-consent."]) {
    assert(eligible(fixture));puts("PASS production metadata policy accepts its own freshly rendered, ordinary local QA image.");
  }
  printf("PASS production NSAlert rendered offscreen %ldx%ld; exact fabricated path, user-selectable text, Keep default. No actual picker, consent or file mutation.\n",(long)bitmap.pixelsWide,(long)bitmap.pixelsHigh);
}}
