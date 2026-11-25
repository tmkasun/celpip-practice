# CELPIP Practice

Independent CELPIP-General practice with timed Writing and Speaking mocks and individual drills. Attempts are stored in the current browser.

## Run locally

Use Node 22.9 or newer. Run `npm ci`, then `npm start` to open the app at `http://localhost:3000`. This command also starts the Writing API on port 8080. Press Ctrl+C to stop both services. Configure `.env.server` to enable AI Writing. Use `npm run start:client` to run React by itself, or `npm run build && npm run serve` to serve the production build and Writing API together at `http://localhost:8080`.

## Configure Gemini Writing

1. In Google AI Studio, create a Gemini authorization key in your paid project. If the account shows depleted prepaid credits, restore its balance before testing. Set a monthly project spend cap and check the active limits for both models. [API keys](https://aistudio.google.com/apikey) · [Spend](https://aistudio.google.com/spend) · [Rate limits](https://aistudio.google.com/rate-limit)
2. Add Firebase to the hosting project. Register a web app, enable the **Google** provider in Firebase Authentication, and add `localhost` and the eventual public hostname under **Authentication → Settings → Authorized domains**. Use the web app’s project ID, app ID, auth domain, and public Firebase API key. [Firebase Google sign-in setup](https://firebase.google.com/docs/auth/web/google-signin)
3. Create the hosting project’s default Firestore database in Native mode. Deploy `firestore.rules` to restrict `writingAiQuota`, `writingAiDaily`, `writingAiQuestions` (including its subcollections), and `writingAiSeen` to server access before enabling the question cache. The server service account needs `roles/datastore.user`. Enable expiration for daily counters with `gcloud firestore fields ttls update expiresAt --collection-group=writingAiDaily --enable-ttl --project=YOUR_HOSTING_PROJECT`.
4. For local AI testing, set `WRITING_AI_ENABLED=true` in `.env.server` and supply `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_WEB_API_KEY`, and the server-only `GEMINI_API_KEY`. Use Application Default Credentials with Firestore access for the Firebase project. You can obtain them with `gcloud auth application-default login`.
5. Run `npm start` and finish a Writing mock with built-in or AI-generated prompts. On the review page, sign in with Google and select **Get AI feedback** to grade the finished responses.

The default models are `gemini-3.5-flash-lite` for prompts and `gemini-3.8-flash` for feedback. Both model IDs are server settings. The default limits count prompt generation, illustration, and feedback operations. A provider fallback shares its original reservation. They allow six per Google account per day, 10 globally per rolling minute, and 300 globally per day. Daily counters reset at midnight Pacific time. Cached questions do not consume these limits, even when generation or feedback is at its limit. A mock that needs both new questions generates them together using one quota reservation, followed by one for feedback.

AI Writing first checks a shared Firestore question bank for questions the signed-in account has not received. Task 1 and Task 2 have separate pools, issued oldest first. Gemini generates only the tasks whose pool the account has exhausted, and validated results are persisted before they can be issued. Concurrent requests claim questions transactionally; a mock marks both tasks as seen together. Questions count as seen when issued, including both tasks of a mock, even if the attempt is abandoned. Exact duplicates are detected after normalizing Unicode, whitespace and letter case; duplicate output can trigger up to three generation calls, each consuming quota.

The append-only bank stores immutable questions and sequence counters under `writingAiQuestions/task1` and `writingAiQuestions/task2`, with questions in each document’s `prompts` subcollection. `writingAiSeen` stores each account’s last-issued sequence for each task. Do not expire, delete or resequence these records: the cursors depend on the complete question history. The sequence queries use Firestore’s default single-field index and need no composite index. Quota counters and viewing cursors use hashed account IDs; the app continues storing answers, feedback and prompt snapshots in browser storage. Existing browser-only attempts are not imported into the bank. Cache errors fail the request without falling back to untracked generation. API logs include cache-hit and generated-task counts without question content or account identifiers.

Set `GEMINI_GRADING_FALLBACK_MODEL` to let the server try one alternate feedback model when the primary times out or Gemini returns HTTP 503 for an unavailable service. The fallback shares the original feedback request’s quota reservation.

## Validate before publishing

Run `CI=true npm test -- --watchAll=false --runInBand`, `npm run test:server`, and `npm run build`.

With a funded Gemini key in `.env.server`, run `npm run test:writing:live -- /path/to/references.json`. Use a local JSON array with three published reference attempts in ascending level order, such as Levels 5, 8, and 11. Each entry has `expectedLevel` and `answers`. Each answer has `task` (1 or 2), `text`, and `prompt` with `context`, `instruction`, and `points` (three email points or two survey options). The check generates a mock, grades the three reference pairs, and checks their ordering and distance from the reference levels. Read the generated mock for realistic scenarios and plausible options. Then sign in to the app locally and complete one full mock to verify Firebase, quotas, and saving in the browser. [Published CELPIP scoring samples](https://www.celpip.ca/scoring-levels/)

## Deploy to Cloud Run

The [Dockerfile](Dockerfile) builds the React app and serves it alongside the Writing API. Deploy first with `WRITING_AI_ENABLED=false` to establish the public URL. Enable the Cloud Run, Cloud Build, Artifact Registry, Firestore, and Secret Manager APIs in the hosting project. Create a runtime service account with Firestore access, store the Gemini key in Secret Manager as `celpip-gemini-api-key`, and grant that runtime account `roles/secretmanager.secretAccessor` on this secret.

```sh
gcloud run deploy celpip-practice --source . --project="$CELPIP_HOSTING_PROJECT" \
  --region=asia-south1 --no-invoker-iam-check --max-instances=3 \
  --service-account="$CELPIP_RUNTIME_ACCOUNT" --set-env-vars=WRITING_AI_ENABLED=false
```

Add the public hostname in Firebase, complete the live checks, and enable AI on the service. Set the Firebase web config values in your deployment shell and select the version of the Gemini secret to mount.

```sh
gcloud run services update celpip-practice --project="$CELPIP_HOSTING_PROJECT" --region=asia-south1 \
  --update-env-vars="WRITING_AI_ENABLED=true,FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID,FIREBASE_APP_ID=$FIREBASE_APP_ID,FIREBASE_AUTH_DOMAIN=$FIREBASE_AUTH_DOMAIN,FIREBASE_WEB_API_KEY=$FIREBASE_WEB_API_KEY" \
  --update-secrets="GEMINI_API_KEY=celpip-gemini-api-key:$GEMINI_KEY_VERSION"
```

Verify a public Google sign-in, mock, and feedback after rollout. Check Cloud Run logs for Writing API status and latency, and AI Studio for spend and quota. To pause AI while keeping built-in practice online, update the service with `WRITING_AI_ENABLED=false`. [Cloud Run deployment](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service) · [Secret Manager integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets)

## Configure AI Speaking

Enable the same Google sign-in, Gemini key, Firestore, and service account used for Writing. Deploy the Firestore rules for the question bank and images. To store new illustrations in Firestore, configure the server as follows.

```dotenv
SPEAKING_AI_ENABLED=true
SPEAKING_IMAGE_STORE=firestore
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-server-token
```

For Cloud Storage, set `SPEAKING_IMAGE_STORE=bucket` (the default) and `SPEAKING_IMAGE_BUCKET` to a bucket with object read/write access. Keep the old bucket configured to load previously issued bucket images. Firestore images use individual documents under `speakingAiQuestions/assets/images`. Restart the API after changing storage settings.

Speaking and Writing can be enabled independently. Speaking uses the configured text-generation model and grading model. Set `GEMINI_SPEAKING_GRADING_MODEL` to override the audio-capable grading model. Both skills share the existing `WRITING_AI_*` quota counters. An uncached mock takes one text call and three image calls. Feedback uses one additional quota reservation. Retain the question bank, cursors, and generated images for saved attempts. Only practice illustrations are served from the bucket through the app.

From the home page, choose a Speaking mock or individual task, select **AI-generated**, and sign in. Review can grade saved built-in and AI attempts. Requesting feedback sends available recordings to Gemini. When Gemini returns a quota error, Cloudflare Whisper transcribes them, and Llama gives transcript-based feedback. Use **Get full Speaking grade** to retry the original recordings with Gemini. The app stores recordings and returned feedback in the current browser. A complete mock with eight assessable recordings receives a section estimate.

Before enabling Speaking in production, run the automated suites, try Chrome and Safari microphone recordings with the configured models, inspect all three types of illustration, and compare practice estimates against published CELPIP Speaking samples.

## Cloudflare Workers AI

Create a Workers AI API token for your account and set the two Cloudflare variables above in the server environment. For Cloud Run, mount the token from Secret Manager. Restart the API after changing credentials. [Cloudflare REST API setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)

FLUX.1 schnell generates all new Speaking illustrations. Cached questions reuse their saved illustrations. Gemini is the primary text and grading provider. When Gemini throttles a request, Cloudflare Llama 3.3 70B generates prompts or grades Writing with the same validation. The app's daily and per-minute limits apply before provider routing.

Speaking fallback uses Whisper large-v3-turbo and, for visual tasks, Llama 3.2 Vision to describe the saved images. The account owner must accept the vision model's license using Cloudflare’s documented setup to enable captions. If vision is unavailable, feedback uses the transcript and prompt. Transcript feedback covers content, vocabulary, and task fulfillment. Audio-based levels and listenability become available after a successful full-grade retry. [Vision model setup](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/)
