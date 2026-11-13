import type { ControlSample, GamepadSettings, KeyBindings } from './types';

export type { ControlSample };

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  throttle: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  handbrake: 'Space',
  nitrous: 'ShiftLeft',
  shiftUp: 'KeyE',
  shiftDown: 'KeyQ',
  camera: 'KeyC',
  rewind: 'Backspace',
  photoMode: 'KeyF',
  replay: 'KeyY',
  reset: 'KeyR',
};

export const DEFAULT_GAMEPAD_SETTINGS: GamepadSettings = {
  deadzone: 0.08,
  steerSensitivity: 1.2,
  speedSensitiveSteering: 0.65,
  triggerSensitivity: 1.0,
  rumbleEnabled: true,
};

export class InputController {
  private keys = new Set<string>();
  private shiftUpQueued = false;
  private shiftDownQueued = false;
  private prevGamepadShiftUp = false;
  private prevGamepadShiftDown = false;
  private touchState: Partial<ControlSample> = {};
  public bindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  public gamepadSettings: GamepadSettings = { ...DEFAULT_GAMEPAD_SETTINGS };
  public activeGamepadName: string | null = null;
  private lastRumbleMs = 0;

  private onKeyDownBound: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUpBound: ((e: KeyboardEvent) => void) | null = null;
  private onBlurBound: (() => void) | null = null;

  public attach(): void {
    if (typeof window === 'undefined' || this.onKeyDownBound) return;
    this.onKeyDownBound = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.setKey(e.code, true);
      if (e.code === this.bindings.shiftUp && !e.repeat) this.queueShiftUp();
      if (e.code === this.bindings.shiftDown && !e.repeat) this.queueShiftDown();
    };
    this.onKeyUpBound = (e: KeyboardEvent) => {
      this.setKey(e.code, false);
    };
    this.onBlurBound = () => {
      this.clear();
    };
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
  }

  public detach(): void {
    if (typeof window === 'undefined') return;
    if (this.onKeyDownBound) window.removeEventListener('keydown', this.onKeyDownBound);
    if (this.onKeyUpBound) window.removeEventListener('keyup', this.onKeyUpBound);
    if (this.onBlurBound) window.removeEventListener('blur', this.onBlurBound);
    this.onKeyDownBound = null;
    this.onKeyUpBound = null;
    this.onBlurBound = null;
  }

  public setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  public queueShiftUp(): void {
    this.shiftUpQueued = true;
  }

  public queueShiftDown(): void {
    this.shiftDownQueued = true;
  }

  public setTouchInput(partial: Partial<ControlSample>): void {
    Object.assign(this.touchState, partial);
  }

  public clear(): void {
    this.keys.clear();
    this.touchState = {};
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
  }

  public hasKey(code: string): boolean {
    return this.keys.has(code);
  }

  public getConnectedGamepadName(): string | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return null;
    }
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) return p.id;
    }
    return null;
  }

  public sample(
    bindingsOverride?: KeyBindings,
    gamepadOverride?: GamepadSettings,
    speedKmh = 0
  ): ControlSample {
    if (bindingsOverride) {
      this.bindings = bindingsOverride;
    }
    if (gamepadOverride) {
      this.gamepadSettings = gamepadOverride;
    }

    const up = this.keys.has(this.bindings.throttle) || this.keys.has('ArrowUp');
    const down = this.keys.has(this.bindings.brake) || this.keys.has('ArrowDown');
    const left = this.keys.has(this.bindings.steerLeft) || this.keys.has('ArrowLeft');
    const right = this.keys.has(this.bindings.steerRight) || this.keys.has('ArrowRight');
    const kbHandbrake = this.keys.has(this.bindings.handbrake);
    const kbNitrous =
      this.keys.has(this.bindings.nitrous) ||
      this.keys.has('ShiftRight') ||
      this.keys.has('KeyN');

    let throttle = up ? 1 : this.touchState.throttle ?? 0;
    let brake = down ? 1 : this.touchState.brake ?? 0;
    let steer = (left ? 1 : 0) - (right ? 1 : 0);
    if (steer === 0 && typeof this.touchState.steer === 'number') {
      steer = this.touchState.steer;
    }
    let handbrake = kbHandbrake || Boolean(this.touchState.handbrake);
    let nitrous = kbNitrous || Boolean(this.touchState.nitrous);

    let shiftUp = this.shiftUpQueued;
    let shiftDown = this.shiftDownQueued;
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;

    // Gamepad API analog polling with non-linear gamma, deadzone & speed-sensitive shaping
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      const pad = Array.from(pads || []).find((p) => p && p.connected) ?? null;
      this.activeGamepadName = pad ? pad.id : null;

      if (pad) {
        const gp = this.gamepadSettings;
        const rawAxis = pad.axes[0] ?? 0;
        const deadzone = Math.max(0.01, Math.min(0.35, gp.deadzone));
        if (Math.abs(rawAxis) > deadzone) {
          const norm = Math.min(1, (Math.abs(rawAxis) - deadzone) / (1 - deadzone));
          const shaped = Math.pow(norm, Math.max(0.5, Math.min(2.4, gp.steerSensitivity)));
          // Speed-sensitive steering damping on analog stick at highway velocities
          const speedRatio = Math.min(1, Math.max(0, speedKmh / 240));
          const speedScale = 1 - gp.speedSensitiveSteering * 0.42 * speedRatio;
          steer = -Math.sign(rawAxis) * Math.min(1, shaped * speedScale);
        }

        const trigGamma = 1 / Math.max(0.6, Math.min(1.6, gp.triggerSensitivity));
        const rtRaw = pad.buttons[7]?.value ?? 0;
        const ltRaw = pad.buttons[6]?.value ?? 0;
        if (rtRaw > 0.03) {
          const rtNorm = Math.min(1, (rtRaw - 0.03) / 0.97);
          throttle = Math.max(throttle, Math.pow(rtNorm, trigGamma));
        }
        if (ltRaw > 0.03) {
          const ltNorm = Math.min(1, (ltRaw - 0.03) / 0.97);
          brake = Math.max(brake, Math.pow(ltNorm, trigGamma));
        }

        // Support right stick vertical axis as fallback analog throttle/brake if triggers unavailable
        const rightStickY = pad.axes[3] ?? 0;
        if (Math.abs(rightStickY) > deadzone + 0.05 && rtRaw <= 0.03 && ltRaw <= 0.03) {
          if (rightStickY < -deadzone) {
            throttle = Math.max(throttle, Math.min(1, (-rightStickY - deadzone) / (1 - deadzone)));
          } else if (rightStickY > deadzone) {
            brake = Math.max(brake, Math.min(1, (rightStickY - deadzone) / (1 - deadzone)));
          }
        }

        if (pad.buttons[0]?.pressed || pad.buttons[2]?.pressed) handbrake = true;
        if (pad.buttons[1]?.pressed || pad.buttons[3]?.pressed) nitrous = true;
        const gpUp = Boolean(pad.buttons[5]?.pressed);
        const gpDown = Boolean(pad.buttons[4]?.pressed);
        if (gpUp && !this.prevGamepadShiftUp) shiftUp = true;
        if (gpDown && !this.prevGamepadShiftDown) shiftDown = true;
        this.prevGamepadShiftUp = gpUp;
        this.prevGamepadShiftDown = gpDown;
      }
    }

    return { throttle, brake, steer, handbrake, nitrous, shiftUp, shiftDown };
  }

  public triggerRumble(weak: number, strong: number, durationMs = 90): void {
    if (!this.gamepadSettings.rumbleEnabled) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastRumbleMs < 65) return;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const pad = Array.from(navigator.getGamepads() || []).find((p) => p && p.connected);
    const actuator = (
      pad as unknown as {
        vibrationActuator?: { playEffect: (t: string, p: Record<string, number>) => Promise<unknown> };
      }
    )?.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      this.lastRumbleMs = now;
      actuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.min(1, Math.max(0, weak)),
          strongMagnitude: Math.min(1, Math.max(0, strong)),
        })
        .catch(() => {});
    }
  }
}
