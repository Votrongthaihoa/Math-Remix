# OneDrive public lesson videos

The course builder accepts a public OneDrive or SharePoint video link. No Microsoft Entra application, Graph permission, client secret, or administrator consent is required.

## Prepare a video link

1. Upload the video to OneDrive or SharePoint.
2. Open **Share** and choose **Anyone with the link** with view-only access.
3. Copy the sharing link and paste it into the course builder.
4. Keep the file shared for as long as learners need to watch it.

The builder anonymously probes the link before saving it. SharePoint public viewers establish a short-lived guest cookie while redirecting to `stream.aspx`; the probe keeps that cookie only for the original SharePoint hostname and never persists it. Links that redirect to sign-in, point to a non-video file, or leave Microsoft's supported hosts are rejected.

OneDrive's generated **Embed** URL is also accepted. Microsoft notes that anyone visiting a page with an embedded file can view it without signing in.

SharePoint can publish a view-only video while explicitly disabling downloads and cross-site framing. Those resources are accepted, but the lesson opens Microsoft's public player in a new tab instead of pretending the file can be played directly in Math Remix. Direct OneDrive video responses still use the native in-lesson player.

## Security boundary

The normal Math Remix account, active-account, publication, enrollment, and content-token checks still run before the learner receives the playback URL. However, this is a public OneDrive link, not DRM: anyone who obtains that Microsoft URL can access the file outside Math Remix. Use private R2 resources or a future delegated Microsoft integration for content that must never be publicly reachable.

The application stores only a stable Microsoft public playback URL. It does not store Microsoft passwords, OAuth tokens, temporary CDN URLs, or Entra credentials.

## Database rollout

Apply `supabase/migrations/20260814003030_onedrive_lesson_video_resources.sql` only after reviewing it and verifying the live project through a project-scoped Supabase connection. The migration is forward-only and only expands the allowed `lesson_resources.resource_type` values plus its column comment.

## Official references

- [Embed files directly into a website or blog](https://support.microsoft.com/en-us/office/embed-files-directly-into-your-website-or-blog-ed07dd52-8bdb-431d-96a5-cbe8a80b7418)
- [Share OneDrive files and folders](https://support.microsoft.com/en-us/office/share-onedrive-files-and-folders-9fcc2f80-3af2-4ffd-8c4d-1b7f23a2b8c3)
