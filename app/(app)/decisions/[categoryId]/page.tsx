import { redirect } from "next/navigation"

type DecisionCategoryPageProps = {
  params: Promise<{
    categoryId: string
  }>
}

export default async function DecisionCategoryPage({
  params,
}: DecisionCategoryPageProps) {
  const { categoryId } = await params
  redirect(`/decisions?category=${categoryId}`)
}
