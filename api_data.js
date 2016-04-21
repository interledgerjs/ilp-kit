define({ "api": [
  {
    "type": "post",
    "url": "/auth/register",
    "title": "Register user",
    "name": "register",
    "group": "Auth",
    "version": "1.0.0",
    "description": "<p>Create a wallet account</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "username",
            "description": "<p>Account username</p>"
          },
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "password",
            "description": "<p>Account password</p>"
          }
        ]
      }
    },
    "examples": [
      {
        "title": "Register an account",
        "content": "curl -x POST\nhttp://wallet.example/auth/register",
        "type": "shell"
      }
    ],
    "success": {
      "examples": [
        {
          "title": "200 Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"username\": \"bob\",\n  \"account\": \"http://wallet.example/ledger/accounts/bob\",\n  \"balance\": \"1000\",\n  \"id\": 1\n}",
          "type": "json"
        }
      ]
    },
    "filename": "api/src/controllers/auth.js",
    "groupTitle": "Auth"
  }
] });
