﻿namespace SourceUtils {
    export class PropStatic extends Entity {
        private info: Api.IStaticProp;
        private drawListItem: StudioModelDrawListItem;

        clusters: number[] = [];

        constructor(map: Map, info: Api.IStaticProp) {
            super();

            this.setPosition(info.origin);
            this.setAngles(info.angles);

            this.info = info;
            if ((info.flags & Api.StaticPropFlags.NoDraw) !== 0 || typeof info.model !== "string") return;

            this.clusters = info.clusters;

            this.drawListItem = new StudioModelDrawListItem(map, info.model as string, info.vertLightingUrl);
            this.drawListItem.parent = this;
            this.drawListItem.isStatic = true;
            this.drawListItem.albedoRgb = info.albedo;
        }

        isWithinVisibleRange(bounds: Box3): boolean {
            if ((this.info.flags & Api.StaticPropFlags.Fades) === 0) return true;

            const minDist = this.getDistanceToBounds(bounds);
            return this.info.fadeMax >= minDist;
        }

        getDrawListItem(): DrawListItem {
            return this.drawListItem;
        }
    }

    export class HardwareVerts extends DrawListItemComponent implements ILoadable<HardwareVerts> {
        private vhvUrl: string;
        private info: Api.IBspVertLightingResponse;
        private loadCallback: () => void;

        constructor(url: string) {
            super();

            this.vhvUrl = url;
        }

        setLoadCallback(callback: () => void): void {
            this.loadCallback = callback;
            if (this.hasLoaded()) callback();
        }

        hasLoaded(): boolean {
            return this.info != null;
        }

        getSamples(meshId: number): number[] {
            return Utils.decompress(this.info.meshes[meshId]);
        }

        shouldLoadBefore(other: HardwareVerts): boolean { return this.getIsVisible(); }

        loadNext(callback: (requeue: boolean) => void): void {
            if (this.info != null) {
                callback(false);
                return;
            }

            $.getJSON(this.vhvUrl,
                (data: Api.IBspVertLightingResponse) => {
                    this.info = data;
                    if (this.loadCallback != null) this.loadCallback();
                }).always(() => callback(false));
        }
    }
}
