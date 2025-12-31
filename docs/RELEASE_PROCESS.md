# Release Process

This document describes how to cut a release for Interlock.

## Prerequisites

Before releasing, ensure:

1. ✅ All PRs for this release are merged to `main`
2. ✅ Secret scan is green on `main`
3. ✅ All required CI checks pass
4. ✅ No open `security-maintenance` PRs blocking release
5. ✅ No known critical bugs

## Cutting a Release

### 1. Create Release Issue (Optional)

Use the [Release Checklist](../.github/ISSUE_TEMPLATE/release_checklist.yml) template to track progress.

### 2. Run the Release Workflow

1. Go to **Actions** → **Create Release**
2. Click **Run workflow**
3. Enter the version number:
   - Format: `vX.Y.Z` (e.g., `v1.2.3`)
   - Pre-releases: `vX.Y.Z-beta` or `vX.Y.Z-rc1`
4. Check "Is this a pre-release?" if applicable
5. Click **Run workflow**

### 3. Verify the Release

After the workflow completes:

1. Check the [Releases page](https://github.com/CULPRITCHAOS/Interlock/releases)
2. Verify the tag was created
3. Verify the changelog looks correct
4. Verify any artifacts are attached

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking changes | Major | v1.0.0 → v2.0.0 |
| New features (backward compatible) | Minor | v1.0.0 → v1.1.0 |
| Bug fixes | Patch | v1.0.0 → v1.0.1 |
| Pre-release | Suffix | v1.0.0-beta |

## Rollback Plan

### If the release has issues:

#### Option 1: Revert the Tag (Before Adoption)

```bash
# Delete the remote tag
git push origin --delete vX.Y.Z

# Delete the local tag
git tag -d vX.Y.Z
```

Then delete the GitHub Release from the Releases page.

#### Option 2: Patch Release (After Adoption)

1. Create a fix PR
2. Merge to `main`
3. Cut a new patch release (e.g., `v1.0.1`)

#### Option 3: Revert PR

```bash
# Create a revert commit
git revert <commit-hash>
git push origin main
```

Then cut a new patch release.

## What the Release Workflow Does

1. **Validates version format** — Must match `vX.Y.Z` or `vX.Y.Z-suffix`
2. **Generates changelog** — From merged PR titles since last tag
3. **Creates Git tag** — Signs with `github-actions[bot]`
4. **Creates GitHub Release** — With changelog body
5. **Posts summary** — Link to the release

## Troubleshooting

### "Tag already exists"

The version has already been released. Choose a different version number.

### "Workflow failed"

Check the workflow logs. Common issues:
- Invalid version format
- Permission issues (check `contents: write`)
- Network issues (retry)

### "Changelog is empty"

This happens on initial releases or if there are no merged PRs since the last tag. The workflow will still create the release with a minimal changelog.

## Related Documents

- [SECURITY_BASELINE.md](./SECURITY_BASELINE.md) — Security change rules
- [SECURITY_POSTURE.md](./SECURITY_POSTURE.md) — Threat model
