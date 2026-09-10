# Topbar evidence

## Authenticated app

- Full viewport width.
- Current live target computed `position: sticky`, top 0, z-index 50.
- White translucent background with approximately 12px backdrop blur and a very light bottom border.
- Expanded shell height measured about 81px; collapsed shell about 73px.
- Left side contains logo plus sidebar toggle; right side contains username and chevron.
- User menu contains `Tài khoản` and `Đăng xuất`; the account item was safely opened and logout was not invoked.
- Desktop dropdown measured 200x76px content, 8px radius, 4px menu padding, Ant placement bottom-right, and z-index 1050.

Local fixed-shell implementation must use the user-requested fixed topbar even though the live target is sticky.

On the observed study route, navigation left the sticky topbar above the current viewport. This is recorded as target behavior, not copied into the local fixed-shell architecture.
