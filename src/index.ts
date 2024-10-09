import { Probot, Context } from "probot";
import { graphql } from "@octokit/graphql";

interface ProjectV2Data {
  organization: {
    projectV2: {
      id: string;
      fields: {
        nodes: Array<{
          id: string;
          name: string;
          options?: Array<{
            id: string;
            name: string;
          }>;
        }>;
      };
    };
  };
}

async function getProjectV2Data(context: Context, orgName: string, projectNumber: number): Promise<ProjectV2Data> {
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${context.octokit.auth()}`,
    },
  });

  const query = `
    query($orgName: String!, $projectNumber: Int!) {
      organization(login: $orgName) {
        projectV2(number: $projectNumber) {
          id
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  return graphqlWithAuth(query, {
    orgName,
    projectNumber,
  });
}

async function getColumnOptionId(projectData: ProjectV2Data, columnName: string): Promise<string | null> {
  const statusField = projectData.organization.projectV2.fields.nodes.find(
    (field) => field.name === "Status"
  );

  if (!statusField || !statusField.options) {
    return null;
  }

  const option = statusField.options.find(
    (opt) => opt.name.toLowerCase() === columnName.toLowerCase()
  );

  return option ? option.id : null;
}

async function addPullRequestToProject(
  context: Context,
  projectId: string,
  prNodeId: string,
  statusOptionId: string,
  statusFieldId: string
): Promise<void> {
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${context.octokit.auth()}`,
    },
  });

  const mutation = `
    mutation($projectId: ID!, $prNodeId: ID!, $statusFieldId: ID!, $statusOptionId: String!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $prNodeId}) {
        item {
          id
        }
      }
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $prNodeId
          fieldId: $statusFieldId
          value: { 
            singleSelectOptionId: $statusOptionId
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await graphqlWithAuth(mutation, {
    projectId,
    prNodeId,
    statusFieldId,
    statusOptionId,
  });
}

export default (app: Probot) => {
  app.on('pull_request.opened', async (context: Context<'pull_request.opened'>) => {
    const prNumber = context.payload.pull_request.number;
    const prNodeId = context.payload.pull_request.node_id;
    console.log("PR number is", prNumber);

    try {
      const orgName = "your-organization-name";
      const projectNumber = 1; // Replace with your actual project number
      const columnName = 'ToDo';

      const projectData = await getProjectV2Data(context, orgName, projectNumber);
      const projectId = projectData.organization.projectV2.id;

      const statusOptionId = await getColumnOptionId(projectData, columnName);
      const statusField = projectData.organization.projectV2.fields.nodes.find(field => field.name === "Status");

      if (!statusOptionId || !statusField) {
        context.log.error(`Column "${columnName}" or Status field not found in project "${projectNumber}"`);
        return;
      }

      await addPullRequestToProject(context, projectId, prNodeId, statusOptionId, statusField.id);

      context.log.info(`Added PR #${prNumber} to project column ${columnName}`);

    } catch (error) {
      context.log.error(`Error adding PR #${prNumber} to project: ${error}`);
    }
  });
};
