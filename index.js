export default (app) => {

  // Function to get column ID by name
  async function getColumnIdByName(context, projectId, columnName) {
    try {

      const project = await context.octokit.rest.projects.get({project_id:projectId});
      context.log.info("project info is " + JSON.stringify(project));

      const { data: columns } = await context.octokit.rest.projects.listColumns({
        project_id: projectId,
      });

      const column = columns.find((col) => col.name.toLowerCase() === columnName.toLowerCase());

      if (!column) {
        context.log.error(`Column "${columnName}" not found in project`);
        return null;
      }

      context.log.info(`Column Id for Column Name ${columnName} is ${column.id}`);

      return column.id;
    } catch (error) {
      context.log.error(`Error fetching column ID: ${(error).message}`);
        return null;
        }
        }

        // @ts-ignore
        app.on('pull_request.opened', async (context) => {

          // @ts-ignore
          const prNumber = context.payload.pull_request.number;
          console.log("PR number is",prNumber);

          try {
          // Replace these with your actual project and column IDs
          const projectId = 1;
          const columnName = 'ToDo';

          // Get the column ID using the new function
          const columnId = await getColumnIdByName(context, projectId, columnName);

          // we couldn't find column ID
          if (columnId === null) {
          return null;
        }

          // Create a project card for the pull request

          const { card } = await context.octokit.rest.projects.createCard({
          column_id: columnId,
          content_id: context.payload.pull_request.id,
          content_type: 'PullRequest',
        });

          context.log.info(`Created project card ${card.id} for PR #${prNumber}`);

        } catch (error) {
          context.log.error(`Error adding PR #${prNumber} to project: ${error}`);
        }
        });
        };
