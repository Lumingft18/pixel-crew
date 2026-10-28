#!/bin/sh
# Update a running `pixel-crew serve` from any script: one job building, then done.
curl -s -X POST localhost:4321/state -d '{"critters":[{"id":"build","color":"#d77757","status":"working","label":"build"}]}'
sleep 10
curl -s -X POST localhost:4321/state -d '{"critters":[{"id":"build","color":"#d77757","status":"idle","label":"build"}],
  "events":[{"at":'"$(date +%s)"',"kind":"ok","text":"build passed","ids":["build"]}]}'
