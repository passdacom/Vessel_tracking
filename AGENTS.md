# Project Instructions

## Graphify First

This project has generated Graphify analysis in `graphify-out/`.

- Read `graphify-out/GRAPH_REPORT.md` before broad architecture, debugging, review, or implementation work.
- Use `graphify query`, `graphify explain`, or `graphify path` with `graphify-out/graph.json` to narrow relevant modules before opening many raw files.
- After meaningful code changes, regenerate the graph:

```bash
/root/.local/share/graphify-venv/bin/python /root/.local/bin/graphify-code-ast-build /root/.openclaw/workspace/Vessel_tracking --name vessel-tracker --obsidian-root /root/.openclaw/workspace/obsidian-data/10_Projects/Graphify
```
