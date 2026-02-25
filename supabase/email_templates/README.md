# Velvora Auth Email Branding

Use this script to set a Velvora-branded confirmation code email template (with logo) in Supabase Auth.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\supabase\set_auth_email_branding.ps1 `
  -ProjectRef "YOUR_PROJECT_REF" `
  -AccessToken "YOUR_SUPABASE_ACCESS_TOKEN" `
  -AppName "Velvora" `
  -LogoUrl "https://YOUR_DOMAIN/favicon.svg"
```

## Notes

- This updates the **confirmation** email template and subject.
- Replace `LogoUrl` with a public HTTPS logo URL.
- If the sender name still appears as Supabase, configure **Custom SMTP** and set sender name to `Velvora` in Supabase Auth settings.
