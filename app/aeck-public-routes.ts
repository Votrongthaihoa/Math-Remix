export const AECK_PUBLIC_ROUTES = [
  "giao-vien",
  "goi-hoc-tap",
  "dang-ky-minh-chung",
  "luyen-thi-tsa",
  "cau-truc-de-thi-tsa",
  "cach-tinh-diem-tsa",
  "luyen-thi-hsa",
  "cau-truc-de-thi-hsa",
  "dang-ky-thi-hsa",
  "dieu-khoan-dich-vu",
  "chinh-sach-bao-mat",
] as const;

export type AeckPublicRoute = "home" | (typeof AECK_PUBLIC_ROUTES)[number];
