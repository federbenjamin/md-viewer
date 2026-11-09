#!/bin/sh
set -eu

pnpm -s test
xcodebuild -project MDViewer/MDViewer.xcodeproj -scheme "MDViewer (macOS)" -configuration Debug -derivedDataPath build/macos CODE_SIGNING_ALLOWED=NO build -quiet
xcodebuild -project MDViewer/MDViewer.xcodeproj -scheme "MDViewer (iOS)" -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build -quiet
