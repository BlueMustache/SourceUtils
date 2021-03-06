﻿/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="Math.ts"/>
/// <reference path="Utils.ts"/>

namespace SourceUtils {
    export enum MouseButton {
        Left = 1,
        Middle = 2,
        Right = 3
    }

    export enum Key {
        Backspace = 8,
        Tab = 9,
        Enter = 13,
        Shift = 16,
        Ctrl = 17,
        Alt = 18,
        PauseBreak = 19,
        CapsLock = 20,
        Escape = 27,
        PageUp = 33,
        PageDown = 34,
        End = 35,
        Home = 36,
        LeftArrow = 37,
        UpArrow = 38,
        RightArrow = 39,
        DownArrow = 40,
        Insert = 45,
        Delete = 46,
        D0 = 48,
        D1 = 49,
        D2 = 50,
        D3 = 51,
        D4 = 52,
        D5 = 53,
        D6 = 54,
        D7 = 55,
        D8 = 56,
        D9 = 57,
        A = 65,
        B = 66,
        C = 67,
        D = 68,
        E = 69,
        F = 70,
        G = 71,
        H = 72,
        I = 73,
        J = 74,
        K = 75,
        L = 76,
        M = 77,
        N = 78,
        O = 79,
        P = 80,
        Q = 81,
        R = 82,
        S = 83,
        T = 84,
        U = 85,
        V = 86,
        W = 87,
        X = 88,
        Y = 89,
        Z = 90,
        LeftWindowKey = 91,
        RightWindowKey = 92,
        Select = 93,
        Numpad0 = 96,
        Numpad1 = 97,
        Numpad2 = 98,
        Numpad3 = 99,
        Numpad4 = 100,
        Numpad5 = 101,
        Numpad6 = 102,
        Numpad7 = 103,
        Numpad8 = 104,
        Numpad9 = 105,
        Multiply = 106,
        Add = 107,
        Subtract = 109,
        DecimalPoint = 110,
        Divide = 111,
        F1 = 112,
        F2 = 113,
        F3 = 114,
        F4 = 115,
        F5 = 116,
        F6 = 117,
        F7 = 118,
        F8 = 119,
        F9 = 120,
        F10 = 121,
        F11 = 122,
        F12 = 123,
        NumLock = 144,
        ScrollLock = 145,
        SemiColon = 186,
        EqualSign = 187,
        Comma = 188,
        Dash = 189,
        Period = 190,
        ForwardSlash = 191,
        GraveAccent = 192,
        OpenBracket = 219,
        BackSlash = 220,
        CloseBraket = 221,
        SingleQuote = 222
    }

    export class AppBase {
        canLockPointer = false;
        doubleClickPeriod = 0.3;

        private container: JQuery;
        private canvas: HTMLCanvasElement;
        private context: WebGLRenderingContext;

        private animateCallback: (time: number) => void;
        private previousTime = 0;
        private lastClickTime = 0;

        private isDragging: boolean;
        private mouseScreenPos = new Vector2();
        private mouseLookDelta = new Vector2();
        private dragStartScreenPos = new Vector2();
        private heldKeys: boolean[] = new Array(128);
        private heldMouseButtons: boolean[] = new Array(8);

        init(container: JQuery): void {
            this.container = container;

            this.canvas = $("<canvas/>")[0] as HTMLCanvasElement;
            this.context = this.canvas.getContext("webgl") as WebGLRenderingContext;

            this.onWindowResize();

            this.animateCallback = (time: number) => {
                const deltaTime = time - this.previousTime;
                this.previousTime = time;
                this.animate(deltaTime * 0.001);
            };

            this.container.append(this.canvas);

            this.container.bind("mousewheel DOMMouseScroll",
                e => {
                    if (e.type === "mousewheel") {
                        this.onMouseScroll((e.originalEvent as any).wheelDelta / 400);
                    } else if (e.type === "DOMMouseScroll") {
                        this.onMouseScroll((e.originalEvent as any).detail / -10);
                    }
                });

            this.container.mousedown(e => {
                this.heldMouseButtons[e.which] = true;
                this.onMouseDown(e.which as MouseButton,
                    this.getScreenPos(e.pageX, e.pageY, this.mouseScreenPos));
                if (this.canLockPointer) this.container[0].requestPointerLock();
                return false;
            });
            $(window).mouseup(e => {
                this.heldMouseButtons[e.which] = false;
                this.onMouseUp(e.which as MouseButton,
                    this.getScreenPos(e.pageX, e.pageY, this.mouseScreenPos));
            });
            $(window).mousemove(e => {
                this.onMouseMove(this.getScreenPos(e.pageX, e.pageY, this.mouseScreenPos));

                if (this.isPointerLocked()) {
                    this.mouseLookDelta.set((e.originalEvent as any).movementX, (e.originalEvent as any).movementY);
                    this.onMouseLook(this.mouseLookDelta);
                }
            });
            $(window).keydown(e => {
                if (e.which < 0 || e.which >= 128) return true;
                this.heldKeys[e.which] = true;
                this.onKeyDown(e.which as Key);
                if (this.isPointerLocked() && e.which as Key === Key.Escape) {
                    document.exitPointerLock();
                }
                return e.which !== Key.Tab;
            });
            $(window).keyup(e => {
                if (e.which < 0 || e.which >= 128) return true;
                this.heldKeys[e.which] = false;
                this.onKeyUp(e.which as Key);
            });
            
            const deltaAngles = new Vector3();
            let lastRotationSampleTime = new Date().getTime() / 1000;

            const deviceRotate = (x: number, y: number, z: number, period: number, toRadians: number) => {
                x *= toRadians / period;
                y *= toRadians / period;
                z *= toRadians / period;

                const sampleTime = new Date().getTime() / 1000;
                const deltaTime = sampleTime - lastRotationSampleTime;
                lastRotationSampleTime = sampleTime;

                deltaAngles.x = x * deltaTime;
                deltaAngles.y = y * deltaTime;
                deltaAngles.z = z * deltaTime;

                this.onDeviceRotate(deltaAngles);
            };

            const wind: any = window;
            if (wind.DeviceMotionEvent) {
                window.addEventListener("devicemotion",
                    evnt => {
                        const rate = evnt.rotationRate;
                        deviceRotate(rate.beta, rate.gamma, rate.alpha, 1.0, 1.0);
                    },
                    true);
            }

            this.container.contextmenu(() => false);

            window.addEventListener("resize", () => this.onWindowResize(), false);
        }

        getLastUpdateTime(): number {
            return this.previousTime * 0.001;
        }

        protected onDeviceRotate(delta: Vector3): void {}

        isPointerLocked(): boolean {
            return document.pointerLockElement === this.container[0];
        }

        toggleFullscreen(): void {
            const container = this.getContainer();
            const cont = container as any;
            const doc = document as any;

            if (document.fullscreenElement === container || document.webkitFullscreenElement === container || doc.mozFullScreenElement === container) {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
            } else if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (cont.mozRequestFullScreen) {
                cont.mozRequestFullScreen();
            }
        }

        getContainer(): HTMLElement {
            return this.container[0];
        }

        getContext(): WebGLRenderingContext {
            return this.context;
        }

        getCanvas(): HTMLCanvasElement {
            return this.canvas;
        }

        getWidth(): number {
            return this.container.innerWidth();
        }

        getHeight(): number {
            return this.container.innerHeight();
        }

        getMouseScreenPos(out?: Vector2): Vector2 {
            if (out == null) out = new Vector2();
            out.copy(this.mouseScreenPos);
            return out;
        }

        getMouseViewPos(out?: Vector2): Vector2 {
            if (out == null) out = new Vector2();
            this.getMouseScreenPos(out);
            out.x = out.x / this.getWidth() - 0.5;
            out.y = out.y / this.getHeight() - 0.5;
            return out;
        }

        private getScreenPos(pageX: number, pageY: number, out?: Vector2): Vector2 {
            if (out == null) out = new Vector2();

            out.x = pageX - this.container.offset().left;
            out.y = pageY - this.container.offset().top;

            return out;
        }

        protected onMouseScroll(delta: number): void {}

        protected onMouseDown(button: MouseButton, screenPos: Vector2): void {
            if (button === MouseButton.Left) {
                this.dragStartScreenPos = screenPos;

                const time = new Date().getTime() / 1000;
                const sinceLast = time - this.lastClickTime;
                this.lastClickTime = time;

                if (sinceLast < this.doubleClickPeriod)
                {
                    this.onDoubleClick(button, screenPos);
                }
            }
        }

        protected onDoubleClick(button: MouseButton, screenPos: Vector2): void {}

        protected onMouseUp(button: MouseButton, screenPos: Vector2): void {
            if (button === MouseButton.Left && this.isDragging) {
                this.isDragging = false;
                this.onDragEnd();
            }
        }

        protected onMouseMove(screenPos: Vector2): void {
            if (this.isMouseButtonDown(MouseButton.Left)) {
                if (!this.isDragging) {
                    this.isDragging = true;
                    this.onDragStart(this.dragStartScreenPos);
                }

                this.onDragUpdate(screenPos);
            }
        }

        protected onMouseLook(delta: Vector2): void {}

        protected onDragStart(screenPos: Vector2): void {}

        protected onDragUpdate(screenPos: Vector2): void {}

        protected onDragEnd(): void {}

        protected onKeyDown(key: Key): void {}

        protected onKeyUp(key: Key): void {}

        isKeyDown(key: Key): boolean {
            return key >= 0 && key < 128 && this.heldKeys[key];
        }

        isMouseButtonDown(button: MouseButton): boolean {
            return button >= 0 && button < this.heldMouseButtons.length && this.heldMouseButtons[button];
        }

        protected onWindowResize(): void {
            this.canvas.width = this.container.innerWidth();
            this.canvas.height = this.container.innerHeight();

            this.context.viewport(0, 0, this.canvas.width, this.canvas.height);

            this.onUpdateCamera();
        }

        protected onUpdateCamera(): void {}

        animate(dt?: number): void {
            dt = dt || 0;

            this.onUpdateFrame(dt);
            this.onRenderFrame(dt);

            requestAnimationFrame(this.animateCallback);
        }

        protected onUpdateFrame(dt: number): void { }

        protected onRenderFrame(dt: number): void { }
    }
}
