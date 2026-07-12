# Snapshot provenance

The standalone hub vendors the simulator and lesson runtime so production is reproducible from this repository alone.

- Initial source repository: `ff-start-poker-hub`
- Imported source commit: `8fc6407c70c8b8e2a66fd0763cd931a24456cc4b`
- Initial standalone hub commit: `335be8e`
- Production route fix: `7d64c25`

The original import included the then-uncommitted BB-ante runtime from the `happy-colden-62f257` worktree. That runtime is now committed and reviewable in this repository; subsequent learning-hub fixes must be made here and must pass `npm run check`. A future upstream sync must name its source commit and review the resulting vendored diff instead of copying a dirty worktree silently.
