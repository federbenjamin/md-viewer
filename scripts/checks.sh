#!/bin/sh
set -eu

pnpm -s test
mkdir -p build
swiftc -o build/viewer-policy-check MDViewer/App/ViewerPolicy.swift tests/swift/main.swift
build/viewer-policy-check
xcodebuild -project MDViewer/MDViewer.xcodeproj -scheme "MDViewer (macOS)" -configuration Debug -derivedDataPath build/macos CODE_SIGNING_ALLOWED=NO build -quiet
xcodebuild -project MDViewer/MDViewer.xcodeproj -scheme "MDViewer (iOS)" -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build -quiet
