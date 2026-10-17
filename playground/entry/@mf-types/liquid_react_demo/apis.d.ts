
    export type RemoteKeys = 'liquid_react_demo/app';
    type PackageType<T> = T extends 'liquid_react_demo/app' ? typeof import('liquid_react_demo/app') :any;