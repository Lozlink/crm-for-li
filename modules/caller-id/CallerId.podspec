require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'CallerId'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = ''
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # The main module (CallerIdModule.swift) lives in ios/. The CallerIdExtension
  # subfolder is a *separate* iOS App Extension target (Call Directory Handler)
  # set up by app.plugin.js — those files MUST NOT be included in this pod or
  # the main app target will conflict with the extension target. Hence the
  # explicit exclusion below.
  s.source_files = 'ios/**/*.{h,m,swift}'
  s.exclude_files = 'ios/CallerIdExtension/**/*'
end
