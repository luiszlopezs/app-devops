# app-devops

A small static web page that explains **CI/CD**, with an interactive pipeline simulator, packaged as a Docker image and built, tested and published to Amazon ECR by an AWS CodeBuild pipeline.

The repository is both the demo content and a working example of the pipeline it describes: tests run first, and **no image is built or pushed if they fail**.

## Features

- Explanation of CI, continuous delivery and continuous deployment.
- Pipeline simulator (Commit → Build → Test → Package → Staging → Production):
  - Inject a failing test and watch the pipeline stop.
  - Switch between continuous deployment (automatic) and continuous delivery (manual approval).
- Zero runtime dependencies: a single `index.html` served by Nginx.

## Project structure

```
.
├── index.html          # The page (HTML, CSS and JS in one file)
├── test/
│   └── page.test.js    # Tests (node:test + jsdom)
├── Dockerfile          # nginx:alpine serving index.html
├── buildspec.yml       # AWS CodeBuild: install → test → docker build → push to ECR
└── package.json        # Test script and dev dependency (jsdom)
```

## Requirements

- Node.js 22+ (tests)
- Docker (to build and run the image locally)

## Run locally

Open `index.html` in a browser, or serve it with Docker:

```bash
docker build -t app-devops .
docker run --rm -p 8080:80 app-devops
```

Then visit <http://localhost:8080>.

## Tests

```bash
npm install
npm test
```

The tests use Node's built-in test runner with [jsdom](https://github.com/jsdom/jsdom) and cover:

- Pipeline logic (`planRun`): all green, failure stops later stages, manual approval in delivery mode.
- Page behaviour: title and stages rendered, full run, injected failure, approve button, state reset between runs.

## CI/CD pipeline

`buildspec.yml` defines the CodeBuild project:

| Phase        | What it does                                                                 |
|--------------|------------------------------------------------------------------------------|
| `install`    | Node 22 runtime, `npm i`                                                     |
| `pre_build`  | Logs in to Amazon ECR                                                        |
| `build`      | `npm run build --if-present` → **`npm test`** → `docker build` and `docker tag` |
| `post_build` | `docker push` (tag = commit SHA) and writes `imagedefinitions.json`          |

Key behaviour:

- `on-failure: ABORT` on `build` and `post_build`. If a test fails, the image is never built and `post_build` (the push) never runs.
- The image is tagged `latest` locally and with `$CODEBUILD_RESOLVED_SOURCE_VERSION` (commit SHA); only the SHA tag is pushed.
- `imagedefinitions.json` references the SHA-tagged image and is the only build artifact, for a downstream deploy stage.

### Configuration

Set in `buildspec.yml` under `env.variables`:

| Variable         | Description                                 |
|------------------|---------------------------------------------|
| `ECR_REPO_URI`   | ECR repository the image is pushed to       |
| `CONTAINER_NAME` | Container name written to `imagedefinitions.json` |

The CodeBuild project must use an image that supports Node 22 (e.g. `aws/codebuild/standard:7.0` or later), run in **privileged mode** (needed for Docker), and have a service role with permission to authenticate to and push to the ECR repository.

## License

No license specified.
