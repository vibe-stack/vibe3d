---
"@scifi-kit/registry": patch
---

Add the Axiom Relay roof group: all ten procedural architecture modules from the
roof-pieces inventory, covering the finished deck, the edge upstand and railing,
the stair head, the plant bases, a skylight, a vented bay, and a shed slope.

They are built on a new `axiom-roof-kit` support item that fixes the group's one
convention: every module is authored about the deck's *top* surface at y = 0,
with structure hanging below into negative Y. A roof fitting is positioned by
where it sits, not by how thick the deck under it happens to be, so a pad
dropped onto a thicker deck later needs no re-authoring. The kit also carries the
shared deck, curb, outlet and parapet builders — nothing on an Axiom roof is
bolted flat to the deck, because the deck is the one layer keeping water out of
the building.
