---
"@scifi-kit/registry": patch
---

Add the Olympus clinic pod: `clinic-facade-module`, `treatment-rooms`, and the `lifeline-clinic` hero assembly.

The assembly is built from the other two rather than authored on its own. Four
facade modules wrap the pod and terminate its corners, one treatment-room
fit-out supplies the whole interior, and the clinic itself only adds what exists
because those parts were put together: the plinth, the portal cut through the
fourth elevation, the roof, the boarding ramp, and the beacon.

Shared kit additions this needed:

- `KitMaterials.porcelain` (SHELL-050) and `KitMaterials.cobalt` (COBALT-500),
  both wired into the prefab wear bake and signal animation;
- `FacePieceOptions.holes`, so an applied frame can carry a real aperture
  instead of hiding the well it was meant to reveal.
