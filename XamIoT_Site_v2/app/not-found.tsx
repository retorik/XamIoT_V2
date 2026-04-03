import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
      <h1 className="text-6xl font-bold text-brand-600 mb-4">404</h1>
      <p className="text-xl text-gray-600 mb-8">Page introuvable</p>
      <Link href="/" className="bg-brand-600 text-white px-6 py-2.5 rounded-lg hover:bg-brand-700 transition-colors font-medium">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
