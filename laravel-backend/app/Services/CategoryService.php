<?php

namespace App\Services;

use App\Models\Category;
use Illuminate\Support\Str;

class CategoryService
{
    public function findAll(bool $includeInactive = false)
    {
        $query = Category::query();
        if (!$includeInactive) {
            $query->where('isActive', true);
        }
        return $query->orderBy('displayOrder')->orderBy('name')->get();
    }

    public function findOne(string $id): Category
    {
        $category = Category::find($id);
        if (!$category) {
            throw new \Exception('Category not found', 404);
        }
        return $category;
    }

    public function create(array $data): Category
    {
        return Category::create([
            'id' => (string)Str::uuid(),
            'name' => trim($data['name']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'displayOrder' => isset($data['displayOrder']) ? (int)$data['displayOrder'] : 0,
            'isActive' => isset($data['isActive']) ? (bool)$data['isActive'] : true,
        ]);
    }

    public function update(string $id, array $data): Category
    {
        $category = $this->findOne($id);

        if (isset($data['name'])) {
            $category->name = trim($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $category->description = $data['description'] !== null ? trim($data['description']) : null;
        }
        if (isset($data['displayOrder'])) {
            $category->displayOrder = (int)$data['displayOrder'];
        }
        if (isset($data['isActive'])) {
            $category->isActive = (bool)$data['isActive'];
        }

        $category->save();
        return $category;
    }

    public function delete(string $id): array
    {
        $category = $this->findOne($id);
        $category->delete();
        return ['message' => 'Category deleted successfully'];
    }
}
