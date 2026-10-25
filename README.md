# Collaborative Research Paper Explorer

A full-stack web application that enables researchers, students, and laboratory members to discover, organize, and annotate research papers collaboratively. The platform provides secure authentication, role-based access control, session management, and PostgreSQL-backed data persistence.

## 📌 Overview

The **Collaborative Research Paper Explorer** simplifies academic research by providing a centralized platform for managing research papers and collaborating with other users.

The application consists of a React-based frontend, a Node.js and Express backend, and a PostgreSQL database. It supports user authentication, email verification, password recovery, institutional Single Sign-On (SSO), and collaborative paper annotation.

## ✨ Features

- **User Authentication:** Secure registration, login, and logout.
- **Email Verification:** Verify registered email addresses and resend verification emails.
- **Password Recovery:** Reset forgotten passwords securely.
- **JWT Authentication:** Token-based authentication with cookie handling.
- **Role-Based Access Control (RBAC):** Restrict access according to user permissions.
- **Institutional SSO:** Support for OAuth-based institutional sign-in.
- **Session Management:** Track sessions, handle expiration, and revoke sessions.
- **Research Paper Management:** Retrieve and browse paper metadata through API endpoints.
- **Collaborative Annotations:** Create, update, retrieve, and delete annotations.
- **PostgreSQL Integration:** Store users, papers, collections, sessions, and related records.
- **Testing:** Automated backend tests for authentication, authorization, validation, and other core functionality.

## 🛠️ Tech Stack

| Component | Technologies |
|---|---|
| Frontend | React, Vite, React Router, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Authentication | JWT, bcryptjs, secure cookies |
| Email Services | Nodemailer |
| Testing | Node.js Test Runner, Supertest |
| Version Control | Git, GitHub |

## 📁 Project Structure

```text
Collaborative-Research-Paper-Explorer/
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
│   │   ├── app.js
│   │   └── server.js
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── package-lock.json
├── database/
│   ├── schema.sql
│   └── *.sql
├── README.md
└── .gitignore
```

## ⚙️ Prerequisites

Make sure the following tools are installed:

- [Node.js](https://nodejs.org/) (version 18 or newer)
- npm
- [PostgreSQL](https://www.postgresql.org/) (version 15 or compatible)
- [Git](https://git-scm.com/)

## 🚀 Getting Started

Follow these steps to run the project locally.

### 1. Clone the Repository

```bash
git clone https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer.git

cd Collaborative-Research-Paper-Explorer
```

### 2. Set Up the Database

Create a PostgreSQL database:

```sql
CREATE DATABASE research_explorer;
```

Import the database schema from the project root:

```bash
psql -U postgres -d research_explorer -f database/schema.sql
```

Enter your PostgreSQL password when prompted.

**Note:** If the repository contains additional migration files required by your version of the project, apply them in the appropriate order.

### 3. Configure Environment Variables

Create a `.env` file inside the `backend/` directory.

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

JWT_SECRET=replace_with_a_long_random_secret

DATABASE_URL=postgresql://postgres:your_password@localhost:5432/research_explorer
```

Replace `your_password` with your PostgreSQL password and configure any additional variables required by the backend.

If email verification, password recovery, or SSO is enabled, configure the required SMTP and OAuth credentials as well.

**Security:** Never commit your `.env` file or expose production credentials in the repository.

### 4. Install Backend Dependencies

Open a terminal at the project root:

```bash
cd backend
npm install
```

### 5. Start the Backend Server

For development:

```bash
npm run dev
```

Alternatively, use:

```bash
npm start
```

The backend will run on the configured port, typically:

`http://localhost:5000`

### 6. Install Frontend Dependencies

Open a second terminal at the project root:

```bash
cd frontend
npm install
```

### 7. Start the Frontend

```bash
npm run dev
```

Open the local URL displayed by Vite, typically:

`http://localhost:5173`

Keep both the frontend and backend terminals running while using the application.

## 🔌 API Overview

The backend exposes REST API endpoints for authentication, research papers, and annotations.

### Authentication — `/api/auth`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/register` | Register a new user |
| POST | `/login` | Authenticate a user |
| POST | `/logout` | Log out and invalidate the applicable session |
| GET | `/me` | Retrieve the current user's information |
| POST | `/verify-email` | Verify an email address |
| POST | `/resend-verification` | Resend an email verification link |
| POST | `/forgot-password` | Initiate password recovery |
| POST | `/reset-password` | Reset a password |
| GET | `/sso/config` | Retrieve SSO configuration |
| GET | `/sso/login` | Initiate SSO authentication |
| GET | `/sso/callback` | Handle the SSO callback |

### Research Papers — `/api/papers`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Retrieve available research papers |

### Annotations — `/api/annotations`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Retrieve annotations |
| POST | `/` | Create an annotation |
| PATCH | `/:id` | Update an annotation |
| DELETE | `/:id` | Delete an annotation |

**Note:** The paths above are relative to their respective API route groups. Actual request URLs may include the `/api` prefix. Authentication, permissions, and request validation may be required for protected endpoints.

## 🔐 Authentication and Authorization

The application incorporates authentication and authorization mechanisms designed to protect user accounts and research resources.

Key concepts include:

- JWT-based authentication.
- Secure cookie handling.
- Password hashing with bcryptjs.
- Role-based permission checks.
- Session expiration and revocation.
- Email verification and password recovery.
- OAuth-based institutional SSO.

Roles and permissions are managed through the application's database schema and backend authorization logic. Use the role identifiers defined in the current schema and configuration.

## 🗄️ Database Design

The database supports the application's authentication and research collaboration workflows.

Core data models include:

- `users` — User accounts and profile information.
- `papers` — Research paper metadata.
- `paper_summaries` — Paper summaries.
- `collections` — User-organized paper collections.
- `collection_members` — Collection membership.
- `collection_papers` — Papers associated with collections.
- `password_reset_tokens` — Password recovery tokens.
- `email_verification_tokens` — Email verification tokens.
- `sso_identities` — External identity provider associations.
- `user_sessions` — User session records.

Additional tables may support roles, permissions, annotations, and other application features, depending on the applied schema and migrations.

## 🧪 Testing

The backend contains automated tests for important application workflows.

Run the backend test suite:

```bash
cd backend
npm test
```

Tests may cover:

- Authentication routes.
- Middleware behavior.
- Authorization and role checks.
- Session expiration.
- SSO workflows.
- Request validation.
- Annotation operations.

Ensure the required environment variables and test database configuration are set before running tests.

## 🤝 Contributing

Contributions are welcome. To keep development organized, work on a separate feature branch instead of pushing directly to `main`.

### Recommended Workflow

**1. Get the latest changes**

```bash
git checkout main
git pull origin main
```

**2. Create a feature branch**

```bash
git checkout -b feature/my-change
```

**3. Make changes and test your code**

Run the relevant tests before committing.

**4. Commit your changes**

```bash
git add .
git commit -m "Add my feature"
```

**5. Push your branch**

```bash
git push -u origin feature/my-change
```

**6. Open a Pull Request**

Create a pull request on GitHub, review the changes, and merge into `main` only after approval.

## 🔒 Security Best Practices

- Keep API keys, database passwords, and JWT secrets in environment variables.
- Never commit `.env` files or other sensitive credentials.
- Validate and sanitize incoming requests.
- Apply authorization checks to protected resources.
- Configure secure cookie attributes for production.
- Use HTTPS in production deployments.
- Keep dependencies updated and review security advisories.

## 📄 License

No custom license is specified here. Check the repository's license information before redistributing or using the project beyond its intended scope.

## 👥 Project Goal

The goal of the **Collaborative Research Paper Explorer** is to make academic research workflows more organized, secure, and collaborative by combining research paper management, authentication, access control, and annotation functionality in one platform.

---

**Repository:** [Collaborative Research Paper Explorer](https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer)


## FR-08: AI-generated paper summaries

Implementation and local setup instructions are in [FR-08_SETUP.md](./FR-08_SETUP.md). The feature uses Google Gemini, PDF text/coordinate extraction, Redis + BullMQ background processing, and PostgreSQL persistence/cache.
