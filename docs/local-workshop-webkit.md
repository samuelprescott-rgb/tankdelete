# Why the offline workshop needs a local-only WebKit startup entitlement

On this Mac the original sandboxed [game bundle](../tmp/production-qa/local-mac-TOc5x9/package.json) and a [minimal AppKit/WebKit control](../tmp/production-qa/local-mac-control-3NznzN/native-menu.json) both launched via LaunchServices. Their windows appeared, but neither rendered a web document. The control contained only static inline HTML; removing game assets, Tauri and Three did not change the outcome.

Reading the operating system's logs at **fault** level and correlating the helpers by launchd owner PID—not merely by process name—identified the missing permission:

| Local time (2026-11-21) | Owner | Helper | OS finding |
| --- | --- | --- | --- |
| 16:01:15.335 / .436 | Game 9792 | GPU 9802 / Networking 9805 | WebKit network-resource permission fault, rc=1, errno=34 |
| 16:03:41.075 / .237 / .254 | Control 10808 | GPU 10818 / Networking 10822, 10824 | Same fault |

Launchd recorded those services exiting with status 1. Upstream [WebKit’s sandboxed helper check](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Shared/EntryPointUtilities/Cocoa/XPCService/XPCServiceEntryPoint.mm#L47-L63) checks network access even for local pages, and [the initializer exits](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Shared/EntryPointUtilities/Cocoa/XPCService/XPCServiceEntryPoint.h#L124-L129) on failure. This is not evidence of bad game assets, missing signing credentials, or a need for more file access.

## Local workshop only

With explicit opt-in, the local packager accepts `--allow-local-webkit-startup` and ad-hoc signs a new, distinct `local.tankdelete.workshop.*` bundle. [Apple's network client entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client) is a **real outgoing-network OS capability**, not a WebKit-specific entitlement. The three signed entitlements are App Sandbox, user-selected read/write files, and network client. The default distribution entitlement file remains unchanged. No incoming network capability, exception, account, credentials, notarization, payment or installation is involved.

Within the workshop app, the main document is restricted to the exact bundled `tauri://localhost` origin. New windows and downloads are denied. A [public WebKit content rule list](https://developer.apple.com/documentation/webkit/wkcontentruleliststore) must compile and be installed before creating any page; it blocks HTTP(S), WS(S), FTP and local file URLs. The production CSP allows bundled resources and native custom-scheme IPC, with no external origins, child frames, form actions, or web sockets. The tiny cleanup broker independently verifies the macOS main window and exact bundled origin. These controls constrain this app's web content; they do not remove the OS network entitlement or constitute system-wide packet monitoring.

The explicit `--verify-cleanup-desk` launch check observes the real rendered menu, clicks **only** its Cleanup Desk button in the bundled DOM, verifies the native-only Choose button is visible on the resulting desk, and records the two states from the owned window. No user file panel or Trash action is part of the check.

### Verified final local package, D4hKvOWf

- The [signed package](../tmp/production-qa/local-mac-4aXOfc/package.json) contains the frozen frontend: [84 byte-for-byte non-HTML assets and the HTML index after Tauri serialization](../tmp/production-qa/local-mac-4aXOfc/embedded-content.json).
- The [ordinary launch receipt](../tmp/production-qa/local-mac-4aXOfc/native-menu.json) proved all three menu labels from the [unflagged game window](../tmp/production-qa/local-mac-4aXOfc/native-menu-0.png). No input was posted.
- A separate [packaged desk and policy test](../tmp/production-qa/local-mac-4aXOfc/workshop-boot.json) reached the [native-enabled Cleanup Desk](../tmp/production-qa/local-mac-4aXOfc/workshop-desk.png). It verified the actual document response CSP, received connect/image/frame violation events, and observed fetch/image/WebSocket rejection. A listener bound only to loopback accepted its own positive control and zero connections from all four probes, including an iframe. No file was selected, reviewed, or moved.
