import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { QualityTier, TimeOfDayId, VehicleTelemetry, WeatherId } from '../config/types';
import { TIME_OF_DAY_PROFILES, WEATHER_PROFILES } from '../config/weather';

interface SkyAndWeatherProps {
  weatherId: WeatherId;
  timeOfDayId: TimeOfDayId;
  qualityTier: QualityTier;
  isSoftwareGl: boolean;
  telemetryRef: React.RefObject<VehicleTelemetry>;
}

const SKY_VERT = `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = `
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStarIntensity;
uniform float uCloudOpacity;
uniform float uTime;
varying vec3 vWorldDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.52));

  // Physical sun halo & disc
  float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sunAmt, 8.0) * 0.35;
  col += uSunColor * smoothstep(0.997, 0.9994, sunAmt) * 2.2;

  // Volumetric-style sky clouds
  if (dir.y > 0.03) {
    vec2 cloudUv = dir.xz / (dir.y + 0.22) * 1.4 + vec2(uTime * 0.008, uTime * 0.004);
    float c = noise(cloudUv * 2.2) * 0.65 + noise(cloudUv * 5.0) * 0.35;
    float cloudMask = smoothstep(0.48, 0.78, c) * smoothstep(0.03, 0.25, dir.y);
    vec3 cloudCol = mix(uHorizonColor * 1.15, vec3(0.95, 0.97, 1.0), 0.45);
    col = mix(col, cloudCol, cloudMask * uCloudOpacity);
  }

  // Night starfield
  if (uStarIntensity > 0.01 && dir.y > 0.08) {
    vec2 starUv = floor(dir.xz / (dir.y + 0.35) * 140.0);
    float s = hash(starUv);
    if (s > 0.993) {
      float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + s * 90.0);
      col += vec3(0.85, 0.92, 1.0) * uStarIntensity * twinkle * smoothstep(0.08, 0.4, dir.y);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function SkyAndWeather({
  weatherId,
  timeOfDayId,
  qualityTier,
  isSoftwareGl,
  telemetryRef,
}: SkyAndWeatherProps) {
  const { gl, scene } = useThree();
  const weather = WEATHER_PROFILES[weatherId];
  const tod = TIME_OF_DAY_PROFILES[timeOfDayId];

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const rainPointsRef = useRef<THREE.Points>(null);
  const skyUniforms = useMemo(
    () => ({
      uTopColor: { value: new THREE.Color(tod.skyTopColor) },
      uHorizonColor: { value: new THREE.Color(tod.skyHorizonColor) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.4, -0.8) },
      uSunColor: { value: new THREE.Color(tod.sunColor) },
      uStarIntensity: { value: tod.starIntensity },
      uCloudOpacity: { value: 0.4 },
      uTime: { value: 0 },
    }),
    []
  );

  // Build RoomEnvironment IBL once for crisp metallic car paint & wet road reflections
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    scene.environment = rt.texture;
    env.dispose();
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  // Sun direction vector
  const sunPos = useMemo(() => {
    const el = THREE.MathUtils.degToRad(tod.sunElevationDeg);
    const az = THREE.MathUtils.degToRad(tod.sunAzimuthDeg);
    const dist = 160;
    return new THREE.Vector3(
      Math.cos(el) * Math.sin(az) * dist,
      Math.sin(el) * dist,
      Math.cos(el) * Math.cos(az) * dist
    );
  }, [tod]);

  // Rain / dust particles geometry
  const particleCount = isSoftwareGl ? 140 : qualityTier === 'low' ? 250 : 900;
  const particlePositions = useMemo(() => {
    const arr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 65;
      arr[i * 3 + 1] = Math.random() * 24;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 65;
    }
    return arr;
  }, [particleCount]);

  const lightningFlash = useRef(0);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    skyUniforms.uTime.value = t;
    skyUniforms.uTopColor.value
      .set(tod.skyTopColor)
      .lerp(new THREE.Color(weather.skyTint), weather.rainIntensity > 0 ? 0.55 : 0.18);
    skyUniforms.uHorizonColor.value
      .set(tod.skyHorizonColor)
      .lerp(new THREE.Color(weather.fogColor), 0.5);
    skyUniforms.uSunDir.value.copy(sunPos).normalize();
    skyUniforms.uSunColor.value.set(tod.sunColor);
    skyUniforms.uStarIntensity.value = weather.rainIntensity > 0.4 ? 0 : tod.starIntensity;
    skyUniforms.uCloudOpacity.value = weather.rainIntensity > 0.2 ? 0.72 : 0.34;

    gl.toneMappingExposure = tod.exposure;

    // Lightning flash boost during thunderstorm
    if (weather.lightningFrequency > 0) {
      if (Math.random() < dt * weather.lightningFrequency * 0.45) {
        lightningFlash.current = 1.0;
      }
      lightningFlash.current = Math.max(0, lightningFlash.current - dt * 4.5);
    } else {
      lightningFlash.current = 0;
    }

    if (sunLightRef.current) {
      const carPos = telemetryRef.current;
      sunLightRef.current.position.set(
        (carPos?.x ?? 0) + sunPos.x * 0.5,
        sunPos.y * 0.5 + 25,
        (carPos?.z ?? 0) + sunPos.z * 0.5
      );
      sunLightRef.current.intensity =
        tod.sunIntensity * weather.ambientBoost + lightningFlash.current * 4.5;
    }

    // Animate rain / sandstorm particles around player car
    if (rainPointsRef.current && (weather.rainIntensity > 0.05 || weather.dustIntensity > 0.2)) {
      const car = telemetryRef.current;
      const cx = car?.x ?? 0;
      const cy = car?.y ?? 0;
      const cz = car?.z ?? 0;
      rainPointsRef.current.position.set(cx, cy, cz);

      const posAttr = rainPointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const fallSpeed = weather.rainIntensity > 0.05 ? 34 : 6;
      const windX = Math.cos(weather.windAngleRad) * weather.windSpeedKmh * 0.14;
      const windZ = Math.sin(weather.windAngleRad) * weather.windSpeedKmh * 0.14;

      for (let i = 0; i < particleCount; i++) {
        let px = posAttr.getX(i) + windX * dt;
        let py = posAttr.getY(i) - fallSpeed * dt;
        let pz = posAttr.getZ(i) + windZ * dt;
        if (py < -2) py += 26;
        if (px > 32) px -= 64;
        if (px < -32) px += 64;
        if (pz > 32) pz -= 64;
        if (pz < -32) pz += 64;
        posAttr.setXYZ(i, px, py, pz);
      }
      posAttr.needsUpdate = true;
    }
  });

  const fogColor = useMemo(() => {
    const c = new THREE.Color(tod.skyHorizonColor).lerp(new THREE.Color(weather.fogColor), 0.65);
    return `#${c.getHexString()}`;
  }, [tod.skyHorizonColor, weather.fogColor]);

  return (
    <group>
      <fogExp2 attach="fog" args={[fogColor, weather.fogDensity]} />

      {/* Physical Sky Dome with Sun, Clouds & Night Stars */}
      <mesh frustumCulled={false}>
        <sphereGeometry args={[720, 28, 18]} />
        <shaderMaterial
          vertexShader={SKY_VERT}
          fragmentShader={SKY_FRAG}
          uniforms={skyUniforms}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Sun Key Light & Hemisphere Sky Bounce */}
      <directionalLight
        ref={sunLightRef}
        position={[sunPos.x, sunPos.y, sunPos.z]}
        intensity={tod.sunIntensity * weather.ambientBoost}
        color={tod.sunColor}
        castShadow={!isSoftwareGl && qualityTier !== 'low'}
        shadow-mapSize-width={qualityTier === 'ultra' ? 2048 : 1024}
        shadow-mapSize-height={qualityTier === 'ultra' ? 2048 : 1024}
        shadow-camera-near={10}
        shadow-camera-far={280}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-bias={-0.0005}
      />
      <ambientLight intensity={isSoftwareGl ? 0.72 : 0.25} color={tod.hemiSkyColor} />
      <hemisphereLight
        args={[tod.hemiSkyColor, tod.hemiGroundColor, tod.hemiIntensity * weather.ambientBoost]}
      />

      {/* Atmospheric Precipitation / Canyon Dust Particles */}
      {(weather.rainIntensity > 0.05 || weather.dustIntensity > 0.2) && (
        <points ref={rainPointsRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particlePositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color={weather.rainIntensity > 0.05 ? '#cbd5e1' : '#d9a468'}
            size={weather.rainIntensity > 0.05 ? 0.18 : 0.45}
            transparent
            opacity={weather.rainIntensity > 0.05 ? 0.6 : 0.45}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}
