# 📚 Collaborative Research Paper Explorer

### Discover. Organize. Collaborate. Research Smarter.

A collaborative platform that brings students, researchers, and academic communities together in one place to discover research papers, manage academic resources, share knowledge, and collaborate on research activities.

---

## 📌 Table of Contents

1. [About the Project](#-about-the-project)
2. [Why This Project?](#-why-this-project)
3. [Key Features](#-key-features)
4. [User Roles](#-user-roles)
5. [Technology Stack](#-technology-stack)
6. [How the Application Works](#-how-the-application-works)
7. [Project Structure](#-project-structure)
8. [Getting Started](#-getting-started)
9. [Environment Configuration](#-environment-configuration)
10. [Running the Application](#-running-the-application)
11. [API Overview](#-api-overview)
12. [Database](#-database)
13. [Security](#-security)
14. [Running Tests](#-running-tests)
15. [Git Workflow](#-git-workflow)
16. [Troubleshooting](#-troubleshooting)
17. [Future Enhancements](#-future-enhancements)
18. [Contributing](#-contributing)

---

## 🔍 About the Project

**Collaborative Research Paper Explorer** is a full-stack web application designed to make academic research more organized, accessible, and collaborative.

Students and researchers often use multiple platforms to find research papers, manage references, communicate with other researchers, and organize their academic work.

Our platform aims to bring these activities together into a single environment.

Users can discover research papers, maintain personal research collections, write collaborative annotations, explore researcher profiles, participate in research groups, and use AI-powered tools to better understand and organize academic content.

The application follows a modular client-server architecture, with a React frontend, Node.js and Express backend, and PostgreSQL database.

## 💡 Why This Project?

Research is not just about finding academic papers. It also involves understanding their content, organizing information, sharing ideas, and collaborating with others.

This project addresses these challenges by providing:

- A centralized platform for managing academic research.
- Tools for organizing and understanding research papers.
- Collaborative annotations and research groups.
- Researcher discovery and community interaction.
- AI-assisted summaries and content organization.
- Secure user accounts with role-based access.

The overall goal is to make the research process more efficient and encourage knowledge sharing within academic communities.

---

## ✨ Key Features

### 1. 🔐 Authentication and Account Management

Provides a secure account management system.

- User registration and login.
- Email verification.
- Forgot-password and password-reset functionality.
- JWT-based authentication.
- Secure cookie handling.
- Logout and session invalidation.
- Automatic session expiration.
- Institutional Single Sign-On (SSO).
- User profile management.

### 2. 👥 Role-Based Access Control

The application supports three main user roles.

- **System Admin:** Manages the platform and monitors system resources.
- **Researcher:** Manages research activities, papers, collections, and collaborations.
- **Student:** Discovers academic resources and participates in research activities.

Permissions are checked on the backend to prevent unauthorized access to protected functionality.

### 3. 📄 Research Paper Management

Provides a centralized space for managing academic papers.

- Upload and manage research papers.
- Browse available research papers.
- Access paper metadata.
- Organize research materials.
- Maintain personal research collections.
- Retrieve paper information through backend APIs.

### 4. 📝 Collaborative Annotations

Allows users to share their thoughts and observations about research papers.

- Create annotations.
- View existing annotations.
- Edit annotations.
- Delete annotations.
- Support collaborative research activities.

This makes it easier for researchers to discuss important findings and exchange ideas.

### 5. 🤖 AI-Powered Research Assistance

AI integration helps users understand and organize research content.

- Generate summaries of research papers.
- Suggest relevant tags based on paper content.
- Recommend existing tags.
- Suggest new tags when appropriate.
- Improve paper organization and discoverability.

### 6. 📑 Research Summary Export

Users can generate and export research summaries.

- Generate summaries of research papers.
- Export summaries as PDF documents.
- Include paper titles and author information.
- Include citations and source information in exported summaries.

### 7. 🌐 Researcher Discovery and Social Features

Encourages interaction between members of the research community.

- Search for researcher profiles.
- View researcher information.
- Discover researchers and their published paper counts.
- Create and share posts.
- Support public and private account visibility.
- Control individual post visibility.

### 8. 💬 Collaborative Messaging and Groups

Provides tools for group-based academic collaboration.

- Create research groups.
- Join existing groups.
- Collaborate with group members.
- Communicate within research groups.
- Participate in academic discussions.

### 9. 🛡️ Administrator Monitoring

Provides system administrators with visibility into important application resources.

- Storage utilization and quotas.
- Redis queue monitoring.
- AI API token consumption.
- AI API usage and associated costs.
- Resource utilization and monitoring alerts.

Some monitoring capabilities require additional environment configuration.

---

## 👤 User Roles

| Role | Description |
|---|---|
| SYSTEM_ADMIN | Responsible for platform administration, monitoring, and system management. |
| RESEARCHER | Can manage papers, research collections, and collaborative activities. |
| STUDENT | Can discover research papers, explore academic resources, and participate in collaboration. |

Each role has different permissions depending on its responsibilities.

---

## 🛠️ Technology Stack

The project uses the following technologies:

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React.js | Building the user interface |
| Build Tool | Vite | Frontend development and bundling |
| Routing | React Router | Managing application navigation |
| Styling | Tailwind CSS | Designing the interface |
| Backend | Node.js | Server-side runtime |
| Backend Framework | Express.js | Building backend APIs |
| Database | PostgreSQL | Storing application data |
| Authentication | JWT | Managing authenticated requests |
| Password Security | bcryptjs | Password hashing |
| Email Services | Nodemailer | Email communication |
| Authentication Integration | OAuth / OIDC | Institutional authentication |
| API Architecture | REST APIs | Frontend-backend communication |
| Testing | Node.js Test Runner, Supertest | Backend testing |
| Version Control | Git and GitHub | Collaborative development |
| AI Integration | Configurable GenAI services | AI-powered research assistance |
| Queue Monitoring | Redis (optional) | Queue and resource monitoring |

---

## 🏗️ How the Application Works

The application follows a **client-server architecture**.

This means that the frontend, backend, and database have separate responsibilities.

### System Architecture

```text
                 USERS
                    |
                    |
          +---------v---------+
          |   React Frontend  |
          |                   |
          | React + Vite      |
          | React Router      |
          | Tailwind CSS      |
          +---------+---------+
                    |
                    |
                REST APIs
                    |
                    |
          +---------v---------+
          |   Node.js Backend |
          |                   |
          | Express.js        |
          | Authentication    |
          | Authorization     |
          | Controllers       |
          | Services          |
          | Middleware        |
          +---------+---------+
                    |
          +---------+----------+
          |                    |
          v                    v
    +-----------+       +--------------+
    | PostgreSQL|       | AI Services  |
    | Database  |       |              |
    +-----------+       +--------------+
                             
                    +--------------+
                    | Redis        |
                    | (Optional)   |
                    +--------------+
```

### Understanding the Architecture

**1. Frontend (React)**

The frontend is the part of the application users interact with.

It handles:
- Displaying pages and components.
- User interactions.
- Navigation between different sections.
- Sending requests to the backend.
- Displaying information received from the server.

**2. Backend (Node.js + Express.js)**

The backend handles the application's main logic.

It is responsible for:
- Processing incoming requests.
- Authenticating users.
- Checking user permissions.
- Communicating with the database.
- Managing application functionality.
- Integrating external services.

**3. Database (PostgreSQL)**

The database stores the application's persistent information, such as user accounts, research paper metadata, annotations, collections, and sessions.

**4. External Services**

Optional external services provide additional capabilities, such as AI-powered assistance, email delivery, institutional authentication, and Redis-based monitoring.

### Example: User Login Flow

1. A user enters their login credentials on the frontend.
2. The frontend sends the credentials to the backend.
3. The backend validates the credentials.
4. The backend checks the stored user information in PostgreSQL.
5. If the credentials are valid, the authentication process creates the appropriate session.
6. The frontend receives the authentication response and updates the user's application state.

This separation makes the application easier to maintain, extend, and scale.

---

## 📁 Project Structure

The repository follows a modular directory structure.

```text
Collaborative-Research-Paper-Explorer/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── modules/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   ├── test/
│   │   ├── utils/
│   │   │
│   │   ├── app.js
│   │   └── server.js
│   │
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── package-lock.json
│
├── database/
│   ├── schema.sql
│   └── *.sql
│
├── docs/
├── uploads/
│
├── .env.example
├── .gitignore
└── README.md
```

### What Does Each Folder Do?

| Folder | Responsibility |
|---|---|
| `backend/src/config` | Application and environment configuration |
| `backend/src/controllers` | Handles incoming API requests |
| `backend/src/middleware` | Authentication, authorization, and request processing |
| `backend/src/modules` | Contains modular application functionality |
| `backend/src/repositories` | Handles database operations |
| `backend/src/routes` | Defines API endpoints |
| `backend/src/services` | Contains business logic and external integrations |
| `backend/src/scripts` | Backend utility scripts |
| `backend/src/test` | Automated backend tests |
| `backend/src/utils` | Shared utility functions |
| `frontend/src` | React application source code |
| `frontend/public` | Public frontend assets |
| `database` | Database schema and SQL scripts |
| `docs` | Additional project documentation |
| `uploads` | Application upload storage |

---

## ⚙️ Getting Started

Follow these instructions to set up the project on your local machine.

### Prerequisites

Make sure you have installed the following software:

| Software | Requirement |
|---|---|
| Node.js | Version 18 or newer |
| npm | Comes with Node.js |
| PostgreSQL | Version 15 or compatible |
| Git | Latest stable version |
| Code Editor | VS Code recommended |

Optional services:

- Redis for queue monitoring.
- SMTP credentials for email delivery.
- Google OAuth credentials for institutional SSO.
- External AI service credentials where required.

Verify your installations:

```bash
node --version
npm --version
git --version
psql --version
```

### Step 1: Clone the Repository

Open your terminal and execute:

```bash
git clone https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer.git
```

Navigate into the project directory:

```bash
cd Collaborative-Research-Paper-Explorer
```

### Step 2: Set Up PostgreSQL

Make sure your PostgreSQL server is running.

Connect to PostgreSQL:

```bash
psql -U postgres -h localhost
```

Create the project database:

```sql
CREATE DATABASE research_explorer;
```

Exit PostgreSQL:

```sql
\q
```

Import the database schema from the project root:

```bash
psql -U postgres -h localhost -d research_explorer -f database/schema.sql
```

Enter your PostgreSQL password when prompted.

If additional database migrations are required by the current version, execute them in the appropriate order.

### Step 3: Configure Environment Variables

The repository contains an `.env.example` file.

Create your local backend environment file.

**Windows PowerShell:**

```powershell
Copy-Item .env.example backend/.env
```

**macOS / Linux:**

```bash
cp .env.example backend/.env
```

Open `backend/.env` and configure the required values.

Refer to the Environment Configuration section below.

### Step 4: Install Backend Dependencies

Open a terminal in the project root:

```bash
cd backend
npm install
```

### Step 5: Install Frontend Dependencies

Open another terminal in the project root:

```bash
cd frontend
npm install
```

The frontend and backend dependencies are installed separately because they are maintained as separate parts of the application.

---

## 🔑 Environment Configuration

Environment variables allow the application to securely access configuration values without hardcoding them into the source code.

Example backend configuration:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# PostgreSQL Configuration
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/research_explorer

# JWT Authentication
JWT_SECRET=replace_with_a_secure_random_secret_at_least_32_characters_long

# Institutional Email Domains
ALLOWED_EMAIL_DOMAINS=dau.ac.in,university.edu

# Institutional SSO / Google OIDC
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=http://localhost:5000/api/auth/sso/callback
OIDC_ISSUER=https://accounts.google.com
OIDC_SCOPES=openid email profile

# Session Management
SESSION_INACTIVITY_TIMEOUT_MS=1800000
SESSION_MAX_AGE_MS=28800000

# Login Rate Limiting
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5

# Password Recovery Rate Limiting
FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS=900000
FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS=5

# Email Configuration
EMAIL_SERVICE_MODE=console

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Collaborative Research Paper Explorer" <no-reply@university.edu>

# System Administrator Monitoring
STORAGE_QUOTA_MB=1024
STORAGE_WARNING_THRESHOLD_PERCENT=80
STORAGE_CRITICAL_THRESHOLD_PERCENT=90

# Redis Monitoring (Optional)
REDIS_URL=

# Development Helpers
EXPOSE_DEV_RESET_TOKEN=false
```

### Important Notes

- Replace `YOUR_PASSWORD` with your actual PostgreSQL password.
- Use a strong, randomly generated JWT secret.
- Configure SMTP credentials if email delivery is required.
- Configure OAuth credentials if institutional SSO is required.
- Redis configuration is optional unless Redis monitoring is enabled.
- Additional configuration may be necessary for specific external integrations.

**Security Warning:** Never upload your `.env` file, passwords, API keys, or other confidential credentials to GitHub.

---

## ▶️ Running the Application

The frontend and backend must run simultaneously.

You will need two separate terminal windows.

### Terminal 1: Start the Backend

Navigate to the backend directory:

```bash
cd backend
```

Start the development server:

```bash
npm run dev
```

Alternatively, use:

```bash
npm start
```

The backend should be accessible at:

```text
http://localhost:5000
```

### Terminal 2: Start the Frontend

Navigate to the frontend directory:

```bash
cd frontend
```

Start the Vite development server:

```bash
npm run dev
```

The frontend should be accessible at:

```text
http://localhost:5173
```

### Access the Application

Open your browser and visit:

**http://localhost:5173**

Keep both terminal windows running while using the application.

---

## 🔌 API Overview

The backend exposes REST APIs that allow the frontend to communicate with the server.

These APIs handle authentication, research paper retrieval, annotations, and other application operations.

### Authentication APIs

Base route: `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register a new user |
| POST | `/login` | Authenticate a user |
| POST | `/logout` | Log out a user |
| GET | `/me` | Retrieve authenticated user information |
| POST | `/verify-email` | Verify registered email |
| POST | `/resend-verification` | Resend verification email |
| POST | `/forgot-password` | Initiate password recovery |
| POST | `/reset-password` | Reset account password |
| GET | `/sso/config` | Retrieve SSO configuration |
| GET | `/sso/login` | Initiate institutional authentication |
| GET | `/sso/callback` | Handle SSO callback |

### Research Paper APIs

Base route: `/api/papers`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Retrieve available research papers |

### Annotation APIs

Base route: `/api/annotations`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Retrieve annotations |
| POST | `/` | Create an annotation |
| PATCH | `/:id` | Update an annotation |
| DELETE | `/:id` | Delete an annotation |

**Note:** This is an overview of the documented endpoints, not necessarily the complete API reference. Refer to the backend route definitions for additional endpoints and implementation details.

---

## 🗄️ Database

The application uses **PostgreSQL** as its primary relational database.

A relational database stores information in structured tables that can be connected through relationships.

The database maintains information related to:

- User accounts and profiles.
- Research paper metadata.
- Paper summaries.
- Research collections.
- Collaborative annotations.
- Authentication sessions.
- Other application records.

The database schema and SQL scripts are maintained in the `database/` directory.

---

## 🔒 Security

Security is an important part of the application's architecture.

The platform incorporates several security mechanisms:

| Mechanism | Purpose |
|---|---|
| JWT Authentication | Identifies authenticated users |
| bcryptjs | Hashes passwords before storage |
| Secure Cookies | Protects authentication cookies |
| Role-Based Access Control | Restricts functionality according to user roles |
| Authorization Middleware | Checks permissions for protected operations |
| Session Management | Controls session lifetime and expiration |
| Rate Limiting | Restricts repeated login and recovery attempts |
| Email Verification | Helps verify registered email addresses |
| Environment Variables | Keeps sensitive configuration outside source code |

### Session Management

The application supports configurable session management.

Default configuration:

- Inactivity timeout: 30 minutes.
- Maximum session lifetime: 8 hours.

These values can be modified through environment variables.

---

## 🧪 Running Tests

The backend uses the Node.js built-in test runner and Supertest for automated testing.

To execute the backend test suite:

```bash
cd backend
npm test
```

Tests are intended to validate important application functionality, including:

- Authentication.
- Authorization.
- Request validation.
- API behavior.
- Core backend operations.

Refer to `backend/package.json` for the available test scripts.

---

## 🌿 Git Workflow

This project uses Git and GitHub for collaborative development.

Contributors should work on separate feature branches instead of directly modifying the `main` branch.

### 1. Get the Latest Changes

```bash
git checkout main
git pull origin main
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Example:

```bash
git checkout -b feature/researcher-profile
```

### 3. Make Changes and Commit

```bash
git add .
git commit -m "Add researcher profile functionality"
```

### 4. Push Your Branch

```bash
git push -u origin feature/your-feature-name
```

### 5. Create a Pull Request

1. Open the repository on GitHub.
2. Navigate to the Pull Requests section.
3. Create a new pull request.
4. Select your feature branch as the source.
5. Select `main` as the target branch.
6. Describe the changes you have made.
7. Request a review from your teammates.
8. Resolve any requested changes.
9. Merge the pull request after approval.

This workflow keeps the main branch organized and makes collaboration easier.

---

## 🛠️ Troubleshooting

Here are some common problems you might encounter while setting up the application.

### 1. Missing JWT_SECRET

**Possible error:**

```text
Missing required environment variable: JWT_SECRET
```

**Solution:**

- Make sure `backend/.env` exists.
- Add a valid `JWT_SECRET`.
- Restart the backend server.

### 2. PostgreSQL Connection Error

**Possible error:**

```text
password authentication failed for user "postgres"
```

**Solution:**

- Verify your PostgreSQL username and password.
- Make sure PostgreSQL is running.
- Check the `DATABASE_URL` in `backend/.env`.
- Ensure that the `research_explorer` database exists.

### 3. npm Execution Policy Error on Windows

**Possible error:**

```text
npm.ps1 cannot be loaded because running scripts is disabled
```

**Solution:**

Use the Windows command wrapper:

```powershell
npm.cmd install
```

To run development scripts:

```powershell
npm.cmd run dev
```

### 4. Port Already in Use

If the backend or frontend port is already occupied:

- Stop the process using that port.
- Alternatively, configure a different available port.
- Restart the application.

### 5. Frontend Cannot Connect to Backend

Check the following:

- The backend server is running.
- The API base URL is correct.
- The configured frontend and backend ports are correct.
- The backend CORS configuration allows the frontend origin.

---

## 🚀 Future Enhancements

Some potential areas for future development include:

- More advanced AI-powered research recommendations.
- Improved research analytics and insights.
- Enhanced collaborative research workflows.
- Additional institutional integrations.
- Advanced research paper discovery.
- Improved application scalability and performance.
- Expanded monitoring and reporting capabilities.

These enhancements can further improve the platform and its usefulness to academic communities.

---

## 🤝 Contributing

Contributions from developers, students, and researchers are welcome.

If you want to contribute:

1. Fork or clone the repository.
2. Create a dedicated feature branch.
3. Implement your changes.
4. Test your implementation.
5. Commit your changes with meaningful messages.
6. Push your branch to GitHub.
7. Open a Pull Request for review.

Please maintain readable code, follow the existing project structure, and avoid committing confidential information.

---

## 📜 License

This project is developed as a collaborative academic software engineering project.

A specific open-source license should be added to the repository before distributing the project under an open-source license.

---

## 👨‍💻 Project Repository

**GitHub:** https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer

Developed as a collaborative academic project with the goal of making research more accessible, organized, and collaborative.

⭐ If you find this project interesting, consider giving the repository a star!

---

**Collaborative Research Paper Explorer — Making Academic Research Smarter and More Connected.**
