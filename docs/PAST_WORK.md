# Relevant Past Work

Two prior projects informed specific decisions in this exercise directly, rather than being generically related.

## Geomarketing platform — map rendering at scale

A geomarketing product plotting points of sale and registered merchants across Italian territory on an interactive map.

That work is what shaped this exercise's rendering approach rather than a first attempt at it: rendering a large number of data points on a map only stays responsive if you separate the *data* from what's actually on screen — you don't redraw or re-layout everything on every pan/zoom, and an overview at low zoom needs a cheaper representation than the full-resolution one used up close. That's the same reasoning behind this repo's `Grid`/`Minimap` split: the color canvas stays at data resolution regardless of zoom (scaled via CSS, not redrawn), the minimap is a deliberately downsampled overview rather than the full dataset shrunk down, and panning/zooming never touches the underlying data — only how much of it, and at what density, gets painted.

## Private-club webapp — real-time messaging

Messaging functionality for a webapp built around creating and running private clubs — live delivery of messages to connected members over WebSockets.

The relevant lesson carried into this exercise: the cost of "real-time" isn't the message itself, it's *who it's being sent to*. A messaging feature that emits one event per message to every connected client works fine until either message frequency or connected-client count grows, at which point the fan-out — not the underlying data change — becomes the bottleneck. That's the exact reasoning behind this repo's broadcast-batching decision (`GridGateway.pendingBroadcast`, documented in `docs/ARCHITECTURE.md`): accepted updates are buffered and flushed on an interval instead of emitted individually, because at the spec's peak load the number of connected viewers, not the update rate itself, is what would have made a naive one-event-per-update design expensive.
