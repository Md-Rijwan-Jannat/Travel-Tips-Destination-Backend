# Travel Tips & Destination Guides - Backend

## Project Overview

The **"Travel Tips & Destination Guides"** backend is a RESTful API designed to support user authentication, profile management, post creation, and interactions among users. This README outlines the API endpoints available in the project.

The Travel Tips & Destination project is a platform for users to share their travel experiences, tips, and reviews. Users can create posts with images and descriptions, comment on posts, react to content, and leave reviews on various travel destinations.

## Technologies Used

- **Node.js**: Server-side rendered React framework for the frontend.
- **TypeScript**: For type-safe development.
- **Mongoose**: As the Object Data Modeling (ODM) library for MongoDB.
- **Express**: As the web framework for building the RESTful API.

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Md-Rijwan-Jannat/Travel-Tips-Destination-Backend.git
   ```

2. **Navigate into the project directory**:

   ```bash
   cd Travel-Tips-Destination-Backend

   ```

3. **Install dependencies**:

   ```bash
   npm install
   ```

   _or_

   ```bash
   bun install
   ```

4. **Create a `.env.local` file in the root directory and add your environment variables**:

   ```bash
   PORT=5000
   database_url=mongodb+srv://<username>:<password>@cluster0.jzg5j.mongodb.net/TravelTips&DestinationGuides?retryWrites=true&w=majority&appName=Cluster0
   NODE_ENV='development'
   cloudinary_cloud_name= // todo put your cloudinary_cloud_name here.
   cloudinary_api_key=// todo put your cloudinary_api_key here.
   cloudinary_api_secret=// todo put your cloudinary_api_secret here.
   bcrypt_salt_rounds=10
   reset_link_url=http://localhost:3000/reset-password
   ```

# admin credentials (REDACTED)

admin_email=****\*\*\*****
admin_password=****\*\*\*****
admin_mobile_number=****\*\*\*****
admin_image=****\*\*\*****

# jwt credentials (REDACTED)

jwt_access_secret=****\*\*\*****
jwt_access_expires_in=365d
jwt_refresh_expires_in=365d

# payment credential (REDACTED)

STORE_ID=****\*\*\*****
SIGNATURE_KEY=****\*\*\*****
AAMARPAY_URL=https://sandbox.aamarpay.com/jsonpost.php
PAYMENT_VERIFY_URL=https://sandbox.aamarpay.com/api/v1/trxcheck/request.php
BACKEND_LIVE_URL=https://travel-tips-destinationco.vercel.app
FRONTEND_LIVE_URL=https://traveltipsdestinationcommunity.vercel.app
FRONTEND_BASE_URL=http://localhost:3000

````

## Table of Contents

- [Features](#features)
- [Models](#models)
- [User Model](#user-model)
- [Post Model](#post-model)
- [Comment Model](#comment-model)
- [React Model](#react-model)
- [Review Model](#review-model)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication-auth)
- [User Profile](#user-profile-profile)
- [Users](#users-users)
- [Posts](#posts-posts)
- [Comments](#comments-comments)
- [Reactions](#reactions-react)
- [Payment](#payment-payment)
- [Conclusion](#conclusion)

## Features

- User registration and authentication
- Create, read, update, and delete posts
- Add images to posts
- Comment on posts
- React to posts and comments
- Rate and review destinations

## Models

### User Model

| Field         | Type     | Description                              |
| ------------- | -------- | ---------------------------------------- |
| \_id          | ObjectId | Unique identifier for the user           |
| Email         | String   | User's email                             |
| Password      | String   | User's password                          |
| Profile image | String   | URL of the user's profile image          |
| Name          | String   | User's full name                         |
| Role          | String   | User role (e.g., admin, user)            |
| Follower      | String   | User's favorite flower                   |
| Following     | String   | Additional info about the user           |
| Status        | String   | User's status (active, inactive)         |
| Country       | String   | User's country                           |
| Address       | String   | User's district                          |
| Verified      | Boolean  | Email verification status                |
| isDeleted     | Boolean  | Soft delete status                       |
| createdAt     | Date     | Timestamp when the user was created      |
| updatedAt     | Date     | Timestamp when the user was last updated |

### Post Model

| Field       | Type     | Description                              |
| ----------- | -------- | ---------------------------------------- |
| \_id        | ObjectId | Unique identifier for the post           |
| User        | ObjectId | Reference to the User model              |
| Images      | Array    | Array of image URLs                      |
| Title       | String   | Title of the post                        |
| Description | String   | Detailed description of the post         |
| Comment     | Array    | Array of Comment IDs                     |
| Status      | String   | Status of the post (published, draft)    |
| Category    | String   | Category of the post                     |
| Report      | Array    | Array of report IDs                      |
| Reacts      | Array    | Array of React IDs                       |
| isDeleted   | Boolean  | Soft delete status                       |
| createdAt   | Date     | Timestamp when the post was created      |
| updatedAt   | Date     | Timestamp when the post was last updated |

### Comment Model

| Field     | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| \_id      | ObjectId | Unique identifier for the comment           |
| User      | ObjectId | Reference to the User model                 |
| Post      | ObjectId | Reference to the Post model                 |
| Text      | String   | Comment content                             |
| Images    | Array    | Array of posting images                     |
| Likes     | Array    | Reference to the User model                 |
| Unlikes   | Array    | Reference to the React model                |
| Replies   | Array    | Reference to the Comment model              |
| isDeleted | Boolean  | I are deleted                               |
| createdAt | Date     | Timestamp when the comment was created      |
| updatedAt | Date     | Timestamp when the comment was last updated |

### React Model

| Field     | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| \_id      | ObjectId | Unique identifier for the react             |
| User      | ObjectId | Reference to the User model                 |
| Comm.Post | Array    | Reference to the Comment- Post model        |
| Type      | String   | Type the reacts                             |
| createdAt | Date     | Timestamp when the comment was created      |
| updatedAt | Date     | Timestamp when the comment was last updated |

### Review Model

| Field     | Type     | Description                                |
| --------- | -------- | ------------------------------------------ |
| \_id      | ObjectId | Unique identifier for the review           |
| User      | ObjectId | Reference to the User model                |
| Review    | String   | The review text                            |
| Rating    | Number   | Rating given by the user (1-5)             |
| createdAt | Date     | Timestamp when the review was created      |
| updatedAt | Date     | Timestamp when the review was last updated |

## API Endpoints

### Authentication (/auth)

1. **Register User**

- **Method**: POST
- **Endpoint**: /auth/register
- **Request Body**:
  ```json
  {
    "name": "Hanif",
    "email": "hanif@gmail.com",
    "password": "12345678"
  }
  ```

2. **Login User**

- **Method**: POST
- **Endpoint**: /auth/login
- **Request Body**:
  ```json
  {
    "email": "rofikul@gmail.com",
    "password": "12345678"
  }
  ```

3. **Forget Password**

- **Method**: POST
- **Endpoint**: /auth/forget-password
- **Request Body**:
  ```json
  {
    "email": "jannatridoy422@gmail.com"
  }
  ```

4. **Reset Password**
- **Method**: POST
- **Endpoint**: /auth/reset-password
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "email": "applew@gmail.com",
    "newPassword": "1234567890"
  }
  ```

### User Profile (/profile)

1. **Get My Profile**

- **Method**: GET
- **Endpoint**: /profile
- **Headers**:
  - Authorization: Bearer Token

2. **Update My Profile**

- **Method**: PATCH
- **Endpoint**: /profile/:id
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "name": "Rijwan"
  }
  ```

3. **Delete My Profile**

- **Method**: DELETE
- **Endpoint**: /profile/:id
- **Headers**:
  - Authorization: Bearer Token

4. **Get My Posts**

- **Method**: GET
- **Endpoint**: /profile/my-posts
- **Headers**:
  - Authorization: Bearer Token

5. **Get My Premium Posts**
- **Method**: GET
- **Endpoint**: /profile/my-premium-posts
- **Headers**:
  - Authorization: Bearer Token

### Users (/users)

1. **Get All Users**

- **Method**: GET
- **Endpoint**: /users
- **Headers**:
  - Authorization: Bearer Token

2. **Get Single User**

- **Method**: GET
- **Endpoint**: /users/:id

3. **Follow User**

- **Method**: PATCH
- **Endpoint**: /users/follow/:id
- **Headers**:
  - Authorization: Bearer Token

4. **Unfollow User**

- **Method**: PATCH
- **Endpoint**: /users/un-follow/:id
- **Headers**:
  - Authorization: Bearer Token

5. **Get Single User's All Posts**
- **Method**: GET
- **Endpoint**: /users/posts/:id

### Posts (/posts)

1. **Create Post**

- **Method**: POST
- **Endpoint**: /posts
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "images": [
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg"
    ],
    "title": "Post Title",
    "description": "Post Description",
    "status": "PREMIUM"
  }
  ```

2. **Get Post**

- **Method**: GET
- **Endpoint**: /posts/:id

3. **Get All Posts**

- **Method**: GET
- **Endpoint**: /posts
- **Headers**:
  - Authorization: Bearer Token

4. **Get All Premium Posts**

- **Method**: GET
- **Endpoint**: /posts/premium
- **Headers**:
  - Authorization: Bearer Token

5. **Update Post**

- **Method**: PATCH
- **Endpoint**: /posts/:id
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "title": "Updated Title"
  }
  ```

6. **Delete Post**
- **Method**: DELETE
- **Endpoint**: /posts/:id
- **Headers**:
  - Authorization: Bearer Token

### Comments (/comments)

1. **Create Comment**

- **Method**: POST
- **Endpoint**: /comments/:postId
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "comment": "This is a comment"
  }
  ```

2. **Get All Comments**

- **Method**: GET
- **Endpoint**: /comments/:postId

3. **Delete Comment**
- **Method**: DELETE
- **Endpoint**: /comments/:id
- **Headers**:
  - Authorization: Bearer Token

### Reactions (/react)

1. **React to Post**

- **Method**: POST
- **Endpoint**: /react/post/:postId
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "reaction": "like"
  }
  ```

2. **React to Comment**
- **Method**: POST
- **Endpoint**: /react/comment/:commentId
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "reaction": "like"
  }
  ```

### Payment (/payment)

1. **Initiate Payment**

- **Method**: POST
- **Endpoint**: /payment/initiate
- **Headers**:
  - Authorization: Bearer Token
- **Request Body**:
  ```json
  {
    "amount": 1000,
    "currency": "USD"
  }
  ```

2. **Get Payment Status**

- **Method**: GET
- **Endpoint**: /payment/status/:paymentId
- **Headers**:
  - Authorization: Bearer Token

3. **Get All Payments**
- **Method**: GET
- **Endpoint**: /payment

## Conclusion

This README provides an overview of the "Travel Tips & Destination Guides" backend API. Each endpoint is designed to facilitate user interactions and enrich the travel community with shared experiences. For further information, feel free to explore the codebase and its documentation.
````
