# Project policy for Claude

## Merge completed work to `main`

`main` is the deployed branch — `.github/workflows/deploy-pages.yml` publishes the
site to GitHub Pages on every push to it. Work that is finished but sitting on a
feature branch is not live, so **when a task is done, land it on `main`.**

Definition of done for any change:

1. Commit the work on the designated feature branch with a descriptive message.
2. Push the branch: `git push -u origin <branch-name>`.
3. Get the change onto `main` — open a PR and merge it once checks pass, or, when
   the user has asked for a direct merge, fast-forward `main` yourself:
   ```
   git fetch origin main
   git checkout main && git pull origin main
   git merge --no-ff <branch-name>
   git push -u origin main
   ```
4. Confirm the Pages deploy for that push succeeded before reporting completion.

Do not leave a finished change stranded on a branch. If a merge cannot be
completed (conflicts needing a product decision, failing checks that are out of
scope, or the user has said to hold), say so explicitly and state what is
blocking it rather than silently stopping at the push.

Two things this policy does not override:

- Never force-push `main`, and never push to a branch the user did not authorize.
- If a pull request is required by branch protection, use the PR path — merging
  through the PR is still "merging to `main`" for the purposes of this policy.
