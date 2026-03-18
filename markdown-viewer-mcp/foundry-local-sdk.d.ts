declare module "foundry-local-sdk" {
  export class FoundryLocalManager {
    static create(config: {
      appName: string;
      serviceEndpoint?: string;
      logLevel?: string;
    }): FoundryLocalManager;
    catalog: ModelCatalog;
    urls: string[];
    startWebService(): void;
    stopWebService(): void;
  }

  export interface ModelCatalog {
    getModel(alias: string): Promise<Model | null>;
  }

  export interface Model {
    id: string;
    download(): Promise<void>;
    load(): Promise<void>;
    unload(): Promise<void>;
    isLoaded(): Promise<boolean>;
  }
}
