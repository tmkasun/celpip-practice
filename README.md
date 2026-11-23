# CELPIP Practice

Independent CELPIP-General practice with timed Writing and Speaking mocks and individual drills. Attempts are stored in the current browser.

## Run locally

Use Node 22.9 or newer. Run `npm ci`, then `npm start` to open the React development server at `http://localhost:3000`. For AI Writing during development, configure `.env.server` and run `npm run serve` in a second terminal. The development server forwards Writing API requests to port 8080. Run `npm run build && npm run serve` to open the production build and Writing API together at `http://localhost:8080`.

## Configure Gemini Writing

1. In Google AI Studio, create a Gemini authorization key in your paid project. If the account shows depleted prepaid credits, restore its balance before testing. Set a monthly project spend cap and check the active limits for both models. [API keys](https://aistudio.google.com/apikey) · [Spend](https://aistudio.google.com/spend) · [Rate limits](https://aistudio.google.com/rate-limit)
2. Add Firebase to the hosting project. Register a web app, enable the **Google** provider in Firebase Authentication, and add `localhost` and the eventual public hostname under **Authentication → Settings → Authorized domains**. Use the web app’s project ID, app ID, auth domain, and public Firebase API key. [Firebase Google sign-in setup](https://firebase.google.com/docs/auth/web/google-signin)
3. Create the hosting project’s default Firestore database in Native mode. Restrict the `writingAiQuota` and `writingAiDaily` collections to server access. The server service account needs `roles/datastore.user`. Enable expiration for daily counters with `gcloud firestore fields ttls update expiresAt --collection-group=writingAiDaily --enable-ttl --project=YOUR_HOSTING_PROJECT`.
4. For local AI testing, copy [.env.server.example](.env.server.example) to `.env.server`, fill in the Firebase settings and server-only Gemini key, then set `WRITING_AI_ENABLED=true`. Use Application Default Credentials with Firestore access for the Firebase project, for example via `gcloud auth application-default login`. Start the Writing API with `npm run serve` and choose **AI-generated** on the home page’s Writing card or on a Writing setup screen.

The default models are `gemini-3.5-flash-lite` for prompts and `gemini-3.8-flash` for feedback. Both model IDs are server settings. The default limits count Gemini requests across both operations. They allow six per Google account per day, 10 globally per rolling minute, and 300 globally per day. Daily counters reset at midnight Pacific time. A mock uses one request for both prompts and one request for feedback. Firestore stores quota counters, with account IDs hashed. The app stores writing and feedback in browser storage. Visitors confirm age and region eligibility before using AI.

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
