/**
 * Registers every hazard system. Add one import per hazard file.
 * P2 registry (./registry: contact, lightning) and P3 environment systems (./host: cold, floes, sky, lantern, horrors, whirlpool).
 */
import "./hazards.css";
import "../../p3.css";
import "./contact";
import "./lightning";
import "./cold";
import "./iceFloes";
import "./fjordSky";
import "./lantern";
import "./horrors";
import "./whirlpool";
export * from "./registry";
export * from "./host";
