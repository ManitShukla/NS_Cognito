export interface AppBuildInfo {
  version: string;
  commit: string;
  buildNumber: string;
  timestamp: string;
  environment: string;
}

declare global {
  const __APP_BUILD_INFO__: AppBuildInfo;
}

export {};
