# Horizon Apex — 3D Open-World Vehicle Dynamics Simulator

High-fidelity open-world racing simulator built with **Three.js**, **React Three Fiber**, **Rapier3D** (fixed **120 Hz** timestep with render interpolation), **Pacejka Magic Formula** tire physics, **Zustand**, **WebAudio**, **WebSockets**, and **@google/genai** Race Engineer.

## Architecture Overview

- `src/config/` — 10-car roster, weather & surface adhesion profiles, rebindable keyboard/gamepad/touch controls
- `src/physics/` — 120 Hz Rapier3D chassis & raycast suspension (`bump/rebound`, ARBs, bump stops), Pacejka Magic Formula tire solver with friction-ellipse combined slip, load sensitivity & thermal wear, engine torque curves & dyno calculator
- `src/vehicle/` — `/models/car.glb` loader + mesh-name config (`body`, `glass`, `wheels FL/FR/RL/RR`, `calipers`, `discs`, `lights`, `interior`) with composite procedural fallback, glowing brake rotors, dynamic dirt/wetness, lights & aero kits
- `src/track/` & `src/world/` — Banked `CatmullRomCurve3` tarmac & Baja dirt spline tracks, curbs, guardrails, puddles, chunked terrain with vertex-splatted surfaces, wind-swaying instanced vegetation, physical sky shader, night stars, clouds, `RoomEnvironment` IBL & 3D rain/dust particles
- `src/fx/` & `src/audio/` — 5-view spring-arm & cockpit camera rig, tiered `@react-three/postprocessing` (SMAA, Bloom, Chromatic Aberration, Vignette, DOF), pooled instanced smoke/dust/gravel/spray/sparks + fading skid marks, layered WebAudio engine/turbo/tire/wind/rain synthesizer
- `src/ai/` — Up to 7 AI opponents driven through the same 120 Hz Rapier + Pacejka physics with curvature racing lines, corner braking, overtaking, and collision avoidance
- `src/ui/` — Minimap HUD, sector splits, `?debug=1` live telemetry & tuning sliders, 3D rotating showroom Garage, Weather/Assist/Mixer/Keybind modal, Photo Mode & Replay scrubber, Multiplayer Lobby, and multi-turn AI Race Engineer
- `src/server/` & `server.ts` — Express + WebSocket multiplayer lobby server + `/api/engineer/chat` (`gemini-4-hydrogen`) + `/api/assets/car-model-status`

## Controls

- **W / Up** — Throttle · **S / Down** — Brake / Reverse
- **A / D or Left / Right** — Steer · **Space** — Handbrake
- **Shift** — Nitrous Oxide · **E / Q** — Manual Shift Up / Down · **X** — Toggle Auto/Manual
- **C** — Cycle Cameras (Chase, Far Chase, Hood, Bumper, Cockpit)
- **Backspace** — Rewind · **R** — Reset to Road · **P** — Photo Mode
- **G** — Garage & Dyno · **V** — Weather & Settings · **H** — AI Race Engineer · **M** — Online Lobby · **Esc** — Pause

## Custom `/models/car.glb` Mesh Names

Place an optional GLB file at `public/models/car.glb` (or upload one live in the Garage). Supported mesh name prefixes:
- `body`, `chassis`, `paint`
- `glass`, `windshield`
- `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
- `caliper_fl`, `caliper_fr`, `caliper_rl`, `caliper_rr`
- `disc_fl`, `disc_fr`, `disc_rl`, `disc_rr`
- `headlights`, `taillights`, `reverse_lights`, `indicator_l`, `indicator_r`
- `interior`, `spoiler`

## Stage Verification Checklist

1. **Stage 1 (Vehicle Dynamics)**: Fixed 120 Hz Rapier step + interpolation verified; Pacejka combined-slip friction ellipse & suspension bump/rebound tested; `?debug=1` exposes live per-wheel telemetry & parameter sliders.
2. **Stage 2 (Car Model & Visuals)**: Physical paint clearcoat/flake, glass transmission, interior cockpit, rotating glowing brake rotors, dynamic dirt/wetness, headlights/brake/reverse/indicators, and `/models/car.glb` loader with procedural fallback verified.
3. **Stage 3 (Track, World, Sky & Weather)**: Banked CatmullRom tarmac/dirt meshes, curbs/guardrails/puddles, chunked heightmap terrain, wind-swaying instanced foliage, physical sky + night stars + clouds + wet reflections verified.
4. **Stage 4 (Camera, Postprocessing, FX & Audio)**: 5-camera rig with drift swing/FOV/trauma shake, tiered EffectComposer (bypassed on Software WebGL), pooled smoke/spray/sparks/skids, and layered WebAudio engine/turbo/tire/wind/rain verified.
5. **Stage 5 (AI, Gameplay, UI & Gemini Engineer)**: Curvature racing-line AI opponents, sector splits/best-lap ghost/rewind/replay, WebSocket lobbies, and multi-turn `@google/genai` Race Engineer chat verified.
6. **Stage 6 (Cleanup, Strict TS & Tests)**: Legacy files removed, TypeScript `strict: true` enabled, unit tests (`pacejka`, `tuning`, `rapierWorld`, `aiDriver`, `lobby`), `npm run build`, `npm run lint`, and headless Chromium checks passing.
