import { Probot, Context } from "probot";

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

type FlexibleOctokit = {
  graphql: (query: string, parameters?: Record<string, any>) => Promise<any>;
};

async function getProjectV2Data(octokit: FlexibleOctokit, orgName: string, projectNumber: number): Promise<ProjectV2Data> {
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

  const result = await octokit.graphql(query, {
    orgName,
    projectNumber,
  });

  return result as ProjectV2Data;
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
  octokit: FlexibleOctokit,
  projectId: string,
  prNodeId: string,
  statusOptionId: string,
  statusFieldId: string
): Promise<void> {
  const addMutation = `
    mutation($projectId: ID!, $prNodeId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $prNodeId}) {
        item {
          id
        }
      }
    }
  `;

  const addResult = await octokit.graphql(addMutation, {
    projectId,
    prNodeId,
  });

  const itemId = addResult.addProjectV2ItemById.item.id;

  const updateMutation = `
    mutation($projectId: ID!, $itemId: ID!, $statusFieldId: ID!, $statusOptionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
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

  await octokit.graphql(updateMutation, {
    projectId,
    itemId,
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
      const orgName = "sidtech-solutions";
      const projectNumber = 2;
      const columnName = 'Todo';

      const projectData = await getProjectV2Data(context.octokit, orgName, projectNumber);
      const projectId = projectData.organization.projectV2.id;

      const statusOptionId = await getColumnOptionId(projectData, columnName);
      const statusField = projectData.organization.projectV2.fields.nodes.find(field => field.name === "Status");

      if (!statusOptionId || !statusField) {
        context.log.error(`Column "${columnName}" or Status field not found in project "${projectNumber}"`);
        return;
      }

      await addPullRequestToProject(context.octokit, projectId, prNodeId, statusOptionId, statusField.id);

      context.log.info(`Added PR #${prNumber} to project column ${columnName}`);

    } catch (error) {
      context.log.error(`Error adding PR #${prNumber} to project: ${error}`);
    }
  });
};
