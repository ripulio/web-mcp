import '@ripul/web-mcp';

const USERS = [
  { id: 1, name: 'Alice Johnson', email: 'alice.johnson@example.com', role: 'Admin' },
  { id: 2, name: 'Bob Smith', email: 'bob.smith@example.com', role: 'User' },
  { id: 3, name: 'Carol Davis', email: 'carol.davis@example.com', role: 'User' },
  { id: 4, name: 'David Brown', email: 'david.brown@example.com', role: 'Moderator' },
  { id: 5, name: 'Emma Wilson', email: 'emma.wilson@example.com', role: 'User' },
  { id: 6, name: 'Frank Miller', email: 'frank.miller@example.com', role: 'User' },
  { id: 7, name: 'Grace Lee', email: 'grace.lee@example.com', role: 'Admin' },
  { id: 8, name: 'Henry Martinez', email: 'henry.martinez@example.com', role: 'User' },
  { id: 9, name: 'Irene Garcia', email: 'irene.garcia@example.com', role: 'Moderator' },
  { id: 10, name: 'Jack Thompson', email: 'jack.thompson@example.com', role: 'User' }
];

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('users-tbody');
  USERS.forEach(user => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
    `;
    tbody.appendChild(row);
  });
});

navigator.modelContext.registerTool({
  name: 'list_users',
  description: 'List the users of this website',
  inputSchema: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Filter the list by those with this role' },
    },
    required: [],
  },
  execute: async (input) => {
    let filteredUsers = USERS;
    const role = input.role;
    if (role) {
      filteredUsers = USERS.filter(user => user.role.toLowerCase() === role.toLowerCase());
    }
    return {
      content: [
        {
          type: 'text',
          text: `Here are the users${role ? ` with the role of ${role}` : ''}:\n` +
            filteredUsers.map(user => `- ${user.name} (${user.email}), Role: ${user.role}`).join('\n')
        }
      ],
      structuredContent: {
        users: filteredUsers
      }
    };
  }
});
