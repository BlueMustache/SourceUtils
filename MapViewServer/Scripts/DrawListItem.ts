﻿namespace SourceUtils {
    export class DrawListItem {
        bounds: Box3;
        parent: Entity;

        isStatic = false;

        private drawLists: DrawList[] = [];
        private meshHandles: WorldMeshHandle[];

        addMeshHandles(handles: WorldMeshHandle[]) {
            if (this.meshHandles == null) this.meshHandles = [];

            for (let i = 0, iEnd = handles.length; i < iEnd; ++i) {
                this.meshHandles.push(handles[i].clone(!this.isStatic ? this.parent : null));
            }

            this.invalidateDrawLists();
        }

        invalidateDrawLists(): void {
            if (!this.getIsVisible()) return;
            for (let i = 0, iEnd = this.drawLists.length; i < iEnd; ++i) {
                this.drawLists[i].updateItem(this);
            }
        }

        getIsVisible(): boolean {
            return this.drawLists.length > 0;
        }

        getIsInDrawList(drawList: DrawList): boolean {
            for (let i = 0, iEnd = this.drawLists.length; i < iEnd; ++i) {
                if (this.drawLists[i] === drawList) {
                    return true;
                }
            }

            return false;
        }

        onAddToDrawList(list: DrawList) {
            if (this.getIsInDrawList(list)) throw "Item added to a draw list twice.";
            this.drawLists.push(list);
        }

        onRemoveFromDrawList(list: DrawList) {
            for (let i = 0, iEnd = this.drawLists.length; i < iEnd; ++i) {
                if (this.drawLists[i] === list) {
                    this.drawLists.splice(i, 1);
                    return;
                }
            }

            throw "Item removed from a draw list it isn't a member of.";
        }

        protected onRequestMeshHandles(): void {}

        getMeshHandles(): WorldMeshHandle[] {
            if (this.meshHandles == null) {
                this.onRequestMeshHandles();
            }

            return this.meshHandles;
        }

        private static rootCenter = new Vector3();
        private static thisCenter = new Vector3();
    }

    export class BspDrawListItem extends DrawListItem implements IFaceLoadTarget {
        private map: Map;
        private loadingFaces = false;

        private tokenPrefix: string;
        private tokenIndex: number;

        constructor(map: Map, tokenPrefix: string, tokenIndex: number) {
            super();
            this.map = map;
            this.tokenPrefix = tokenPrefix;
            this.tokenIndex = tokenIndex;
        }

        protected onRequestMeshHandles(): void {
            if (this.loadingFaces) return;
            this.loadingFaces = true;
            this.map.faceLoader.loadFaces(this);
        }

        faceLoadPriority(map: Map): number {
            if (!this.getIsVisible()) return Number.POSITIVE_INFINITY;
            if (this.bounds == null) return Number.MAX_VALUE;
            return 0;
        }

        onLoadFaces(handles: WorldMeshHandle[]): void {
            this.addMeshHandles(handles);
        }

        getApiQueryToken(): string { return `${this.tokenPrefix}${this.tokenIndex}`; }
    }

    export abstract class DrawListItemComponent {
        private usages: DrawListItem[] = [];

        addUsage(item: DrawListItem): void {
            this.usages.push(item);
        }

        getIsVisible(): boolean {
            for (let i = 0, iEnd = this.usages.length; i < iEnd; ++i) {
                if (this.usages[i].getIsVisible()) return true;
            }

            return false;
        }
    }

    export class StudioModelDrawListItem extends DrawListItem {
        private map: Map;
        private mdlUrl: string;
        private vhvUrl: string;
        private mdl: StudioModel;
        private vhv: HardwareVerts;

        private bodyPartModels: { [bodyPart: number]: number } = { [0]: 0 };

        albedoRgb = 0xffffff;

        private shouldDisplayModel(model: SmdModel): boolean {
            return this.bodyPartModels[model.bodyPart.index] === model.index;
        }

        protected onRequestMeshHandles(): void {
            if (this.mdl != null) return;
            this.mdl = this.map.modelLoader.load(this.mdlUrl);
            this.mdl.addUsage(this);

            let queuedToLoad: SmdModel[] = [];

            if (this.vhvUrl != null) {
                this.vhv = this.map.hardwareVertsLoader.load(this.vhvUrl);
                this.vhv.addUsage(this);
                this.vhv.setLoadCallback(() => {
                    for (let i = 0; i < queuedToLoad.length; ++i) {
                        this.onModelLoad(queuedToLoad[i]);
                    }

                    queuedToLoad = [];
                });
            }

            this.mdl.addModelLoadCallback(model => {
                if (!this.shouldDisplayModel(model)) return;

                if (this.vhv != null && !this.vhv.hasLoaded()) {
                    queuedToLoad.push(model);
                } else {
                    this.onModelLoad(model);
                }
            });
        }

        private onModelLoad(model: SmdModel): void {
            this.addMeshHandles(model.createMeshHandles(this.isStatic ? this.parent : null,
                model === this.mdl.getModel(0, 0) ? this.vhv : null, this.albedoRgb));
        }

        constructor(map: Map, mdlUrl: string, vhvUrl?: string) {
            super();
            this.map = map;
            this.mdlUrl = mdlUrl;
            this.vhvUrl = vhvUrl;
        }
    }
}