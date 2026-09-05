/**
 * Image-based light without an image. drei renders these light-formers into
 * a small cubemap once and hands it to every physical material as the
 * environment, so bark, phyllodes and petals pick up a real ambient term and
 * a real sheen. Nothing is fetched: the whole rig is procedural, which keeps
 * the page's promise that no request leaves the origin.
 *
 * Four forms: a warm key above and to the left, a cool narrow rim behind and
 * to the right, a dim earth bounce below, and a faint sky above.
 */
import { Environment, Lightformer } from "@react-three/drei";

import { LIGHT_RIG } from "../motion/tokens";

export function Lighting() {
  return (
    <Environment resolution={256} frames={1} background={false} environmentIntensity={LIGHT_RIG.environment}>
      <Lightformer form="rect" intensity={LIGHT_RIG.key} color="#fff1d0" scale={[6, 4, 1]} position={[-5, 6, 5]} target={[0, 3, 0]} />
      <Lightformer form="rect" intensity={LIGHT_RIG.rim} color="#cfe0ff" scale={[1.6, 7, 1]} position={[6, 3, -5]} target={[0, 3, 0]} />
      <Lightformer form="rect" intensity={LIGHT_RIG.bounce} color="#6a5a3a" scale={[12, 12, 1]} position={[0, -6, 0]} rotation-x={Math.PI / 2} />
      <Lightformer form="circle" intensity={LIGHT_RIG.sky} color="#dfe8f2" scale={12} position={[0, 10, 0]} rotation-x={-Math.PI / 2} />
    </Environment>
  );
}
