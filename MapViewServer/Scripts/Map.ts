﻿/// <reference path="AppBase.ts"/>

namespace SourceUtils {
    export class Map extends Entity implements IStateLoggable {
        info: Api.IBspIndexResponse;

        faceLoader: FaceLoader;
        textureLoader: TextureLoader;
        modelLoader: StudioModelLoader;
        hardwareVertsLoader: HardwareVertsLoader;

        meshManager: WorldMeshManager;
        shaderManager: ShaderManager;

        private app: AppBase;

        private loaders: ILoader[] = [];

        private lightmap: Texture;
        private blankMaterial: Material;
        private errorMaterial: Material;
        private skyMaterial: Material;

        private models: BspModel[] = [];
        private displacements: Displacement[] = [];
        private staticProps: PropStatic[] = [];
        private materials: Material[] = [];

        private clusters: VisLeaf[][];
        private pvsArray: VisLeaf[][];

        private drawListInvalidationHandlers: ((geom: boolean) => void)[] = [];

        constructor(app: AppBase, url: string) {
            super();

            this.app = app;

            this.faceLoader = this.addLoader(new FaceLoader(this));
            this.modelLoader = this.addLoader(new StudioModelLoader(this));
            this.hardwareVertsLoader = this.addLoader(new HardwareVertsLoader());
            this.textureLoader = this.addLoader(new TextureLoader(this, app.getContext()));

            this.meshManager = new WorldMeshManager(app.getContext());
            this.shaderManager = new ShaderManager(app.getContext());

            this.blankMaterial = new Material(this, "LightmappedGeneric");
            this.blankMaterial.properties.baseTexture = this.shaderManager.getWhiteTexture();
            this.errorMaterial = new Material(this, "LightmappedGeneric");
            this.errorMaterial.properties.baseTexture = new ErrorTexture2D(app.getContext());

            this.loadInfo(url);
        }

        private addLoader<TLoader extends ILoader>(loader: TLoader): TLoader {
            this.loaders.push(loader);
            return loader;
        }

        getApp(): AppBase {
            return this.app;
        }

        getLightmap(): Texture {
            return this.lightmap || this.shaderManager.getWhiteTexture();
        }

        getWorldSpawn(): BspModel {
            return this.models.length > 0 ? this.models[0] : null;
        }

        setSkyMaterialEnabled(value: boolean): void {
            if (this.skyMaterial != null) this.skyMaterial.enabled = value;
        }

        getSkyMaterial(): Material {
            return this.skyMaterial;
        }

        getMaterial(index: number): Material {
            return index === -1
                ? this.skyMaterial
                : (index < this.materials.length ? this.materials[index] : this.blankMaterial) || this.errorMaterial;
        }

        private generateComposeFrameMeshData(): MeshData {
            return new MeshData({
                components: Api.MeshComponent.Uv,
                vertices: [-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0],
                indices: [0, 1, 2, 0, 2, 3],
                elements: [
                    {
                        type: Api.PrimitiveType.TriangleList,
                        material: undefined,
                        indexOffset: 0,
                        indexCount: 6
                    }
                ]
            });
        }

        private composeFrameHandle: WorldMeshHandle;

        getComposeFrameMeshHandle(): WorldMeshHandle {
            if (this.composeFrameHandle !== undefined) return this.composeFrameHandle;

            this.composeFrameHandle = this.meshManager.addMeshData(this.generateComposeFrameMeshData())[0];
            this.composeFrameHandle.parent = null;
            this.composeFrameHandle.material = new Material(this, "ComposeFrame");
            this.composeFrameHandle.material.properties.noCull = true;

            return this.composeFrameHandle;
        }

        private loadInfo(url: string): void {
            $.getJSON(url,
                (data: Api.IBspIndexResponse) => {
                    this.info = data;
                    this.models = new Array<BspModel>(data.numModels);
                    this.clusters = new Array<VisLeaf[]>(data.numClusters);

                    for (let i = 0; i < data.numClusters; ++i) {
                        this.clusters[i] = new Array<VisLeaf>();
                    }

                    this.pvsArray = new Array<Array<VisLeaf>>(data.numClusters);
                    this.lightmap = new Lightmap(this.app.getContext(), data.lightmapUrl);

                    this.loadDisplacements();
                    this.loadMaterials();
                    this.loadStaticProps();

                    this.skyMaterial = new Material(this, data.skyMaterial);

                    for (let i = 0; i < data.brushEnts.length; ++i) {
                        const ent = data.brushEnts[i];
                        if (this.models[ent.model] !== undefined) throw "Multiple models with the same index.";
                        this.models[ent.model] = new BspModel(this, ent);
                    }
                });
        }

        private loadDisplacements(): void {
            $.getJSON(this.info.displacementsUrl,
                (data: Api.IBspDisplacementsResponse) => {
                    this.displacements = [];

                    for (let i = 0; i < data.displacements.length; ++i) {
                        this.displacements.push(new Displacement(this.getWorldSpawn(), data.displacements[i]));
                    }

                    this.forceDrawListInvalidation(true);
                });
        }

        private loadMaterials(): void {
            $.getJSON(this.info.materialsUrl,
                (data: Api.IBspMaterialsResponse) => {
                    this.materials = [];

                    for (let i = 0; i < data.materials.length; ++i) {
                        const mat = data.materials[i];
                        if (mat == null) {
                            this.materials.push(null);
                        } else {
                            this.materials.push(new Material(this, data.materials[i]));
                        }
                    }

                    this.forceDrawListInvalidation(false);
                });
        }

        private loadStaticProps(): void {
            $.getJSON(this.info.staticPropsUrl,
                (data: Api.IBspStaticPropsResponse) => {
                    this.staticProps = [];

                    for (let i = 0; i < data.props.length; ++i) {
                        const prop = data.props[i];
                        if (typeof prop.model === "number") {
                            prop.model = data.models[prop.model];
                        }

                        this.staticProps.push(new PropStatic(this, prop));
                    }

                    this.forceDrawListInvalidation(true);
                });
        }

        addDrawListInvalidationHandler(action: (geom: boolean) => void): void {
            this.drawListInvalidationHandlers.push(action);
        }

        forceDrawListInvalidation(geom: boolean): void {
            for (let i = 0; i < this.drawListInvalidationHandlers.length; ++i) {
                this.drawListInvalidationHandlers[i](geom);
            }
        }

        onModelLoaded(model: BspModel): void {
            if (model !== this.getWorldSpawn()) return;

            const leaves = model.getLeaves();
            for (let i = 0; i < leaves.length; ++i) {
                const leaf = leaves[i];
                if (leaf.cluster === -1) continue;
                this.clusters[leaf.cluster].push(leaf);
            }
        }

        update(): void {
            for (let i = 0; i < this.loaders.length; ++i) {
                this.loaders[i].update(4);
            }
        }

        getPvsArray(root: VisLeaf, callback: (pvs: VisLeaf[]) => void): void {
            const pvs = this.pvsArray[root.cluster];
            if (pvs != null) {
                callback(pvs);
                return;
            }

            this.loadPvsArray(root, callback);
        }

        private isAnyClusterVisible(clusters: number[], drawList: DrawList): boolean {
            for (let j = 0, jEnd = clusters.length; j < jEnd; ++j) {
                if (this.clusters[clusters[j]][0].getIsInDrawList(drawList)) return true;
            }
            return false;
        }

        private rootBounds = new Box3();

        appendToDrawList(drawList: DrawList, pvsRoot: VisLeaf, pvs: VisLeaf[]): void
        {
            if (pvsRoot == null) {
                const worldSpawn = this.getWorldSpawn();
                worldSpawn.getBounds(this.rootBounds);
            } else {
                this.rootBounds.copy(pvsRoot.bounds);
            }

            for (let i = 0, iEnd = pvs.length; i < iEnd; ++i) {
                drawList.addItem(pvs[i]);
            }

            for (let i = this.displacements.length - 1; i >= 0; --i) {
                const disp = this.displacements[i];
                if (this.isAnyClusterVisible(disp.clusters, drawList)) {
                    drawList.addItem(disp);
                }
            }

            for (let i = 1, iEnd = this.models.length; i < iEnd; ++i) {
                const model = this.models[i];
                if (model == null) continue;
                if (!this.isAnyClusterVisible(model.clusters, drawList)) continue;

                const leaves = model.getLeaves();
                for (let j = 0, jEnd = leaves.length; j < jEnd; ++j) {
                    drawList.addItem(leaves[j]);
                }
            }

            for (let i = 0, iEnd = this.staticProps.length; i < iEnd; ++i) {
                const prop = this.staticProps[i];
                if (prop == null) continue;
                if (!this.isAnyClusterVisible(prop.clusters, drawList)) continue;
                if (!prop.isWithinVisibleRange(this.rootBounds)) continue;
                drawList.addItem(prop.getDrawListItem());
            }
        }

        private loadPvsArray(root: VisLeaf, callback?: (pvs: VisLeaf[]) => void): void {
            const pvs = this.pvsArray[root.cluster] = [];

            const url = this.info.visibilityUrl.replace("{index}", root.cluster.toString());
            $.getJSON(url,
                (data: Api.IBspVisibilityResponse) => {
                    const indices = Utils.decompress(data.pvs);

                    for (let i = 0; i < indices.length; ++i) {
                        const cluster = this.clusters[indices[i]];
                        for (let j = 0; j < cluster.length; ++j) {
                            pvs.push(cluster[j]);
                        }
                    }

                    if (callback != null) callback(pvs);
                });
        }

        logState(writer: FormattedWriter): void {
            writer.beginBlock("meshManager");
            this.meshManager.logState(writer);
            writer.endBlock();
        }
    }
}