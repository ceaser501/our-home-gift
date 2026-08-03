export default function Logo({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#5B4FE8" />
      <path d="M15.4 11.2C13.6 11.2 12.1 11.1 11.3 10.3C10.4 9.4 10.7 7.9 11.9 7.5C13.3 7 14.8 8.8 15.4 11.2Z" fill="white" />
      <path d="M16.6 11.2C18.4 11.2 19.9 11.1 20.7 10.3C21.6 9.4 21.3 7.9 20.1 7.5C18.7 7 17.2 8.8 16.6 11.2Z" fill="white" />
      <rect x="5.2" y="11.2" width="21.6" height="5.2" rx="1.4" fill="white" />
      <rect x="7.2" y="16.4" width="17.6" height="10.4" rx="1.4" fill="white" />
      <rect x="14.7" y="11.2" width="2.6" height="15.6" fill="#5B4FE8" />
    </svg>
  );
}
