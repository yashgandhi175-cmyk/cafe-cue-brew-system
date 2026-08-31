<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\CategoryService;

class CategoryController extends Controller
{
    protected $categoryService;

    public function __construct(CategoryService $categoryService)
    {
        $this->categoryService = $categoryService;
    }

    public function index(Request $request)
    {
        $includeInactive = $request->query('all') === 'true';
        return response()->json($this->categoryService->findAll($includeInactive));
    }

    public function show(string $id)
    {
        try {
            return response()->json($this->categoryService->findOne($id));
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:Category,name',
            'description' => 'nullable|string',
            'displayOrder' => 'nullable|integer',
            'isActive' => 'nullable|boolean',
        ]);

        try {
            $category = $this->categoryService->create($data);
            return response()->json($category, 201);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => 'nullable|string|max:255|unique:Category,name,' . $id . ',id',
            'description' => 'nullable|string',
            'displayOrder' => 'nullable|integer',
            'isActive' => 'nullable|boolean',
        ]);

        try {
            $category = $this->categoryService->update($id, $data);
            return response()->json($category);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function destroy(string $id)
    {
        try {
            $result = $this->categoryService->delete($id);
            return response()->json($result);
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }
}
