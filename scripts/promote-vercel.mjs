import { setTimeout as delay } from "node:timers/promises";

const {
  VERCEL_ORG_ID: teamId,
  VERCEL_PROJECT_ID: projectId,
  VERCEL_TOKEN: token,
} = process.env;
const deploymentHost = new URL(process.argv[2]).hostname;
const projectPath = `/v9/projects/${encodeURIComponent(projectId)}`;

async function request(path, method = "GET", allowedStatus) {
  const url = new URL(path, "https://api.vercel.com");
  url.searchParams.set("teamId", teamId);
  const headers = { Authorization: `Bearer ${token}` };
  if (method === "POST") headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? "{}" : undefined,
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok && response.status !== allowedStatus) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Vercel ${method} ${path}: HTTP ${response.status} (${error.error?.code ?? "unknown error"})`,
    );
  }
  return response;
}

// The CLI's promote command looks up a Vercel user before reaching the team API.
const lookup = await request(`/v13/deployments/${encodeURIComponent(deploymentHost)}`);
const deployment = await lookup.json();
if (
  !deployment.id ||
  deployment.projectId !== projectId ||
  deployment.target !== "production" ||
  deployment.readyState !== "READY"
) {
  throw new Error("Expected a ready production deployment for the configured Vercel project.");
}

const promotionRequest = await request(
  `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deployment.id)}`,
  "POST",
  409,
);

const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  const projectResponse = await request(projectPath);
  const project = await projectResponse.json();
  const promotion = project.lastAliasRequest;
  const matchesPromotion = promotion?.toDeploymentId === deployment.id;
  const isCurrent = project.targets?.production?.id === deployment.id;

  if (matchesPromotion && promotion.jobStatus === "failed") {
    throw new Error("Vercel reported a failed production promotion.");
  }
  if (isCurrent && (!matchesPromotion || ["succeeded", "skipped"].includes(promotion.jobStatus))) {
    console.log(`Vercel promoted ${deploymentHost} to production.`);
    process.exit(0);
  }
  if (promotionRequest.status === 409 && !matchesPromotion && !isCurrent) {
    throw new Error("Vercel rejected the promotion with a conflict and this deployment is not current.");
  }
  await delay(3000);
}
throw new Error("Timed out waiting for the staged deployment to become current.");
