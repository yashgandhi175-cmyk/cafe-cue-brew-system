<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\PublicMenuService;

class PublicMenuController extends Controller
{
    protected $publicMenuService;

    public function __construct(PublicMenuService $publicMenuService)
    {
        $this->publicMenuService = $publicMenuService;
    }

    public function settings()
    {
        try {
            return response()->json($this->publicMenuService->getPublicSettings());
        } catch (\Exception $e) {
            $code = (is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? (int)$e->getCode() : 400;
            return response()->json(['message' => $e->getMessage(), 'statusCode' => $code], $code);
        }
    }

    public function categories()
    {
        return response()->json($this->publicMenuService->getPublicCategories());
    }

    public function banners()
    {
        return response()->json($this->publicMenuService->getPublicBanners());
    }

    public function index(Request $request)
    {
        $filters = [
            'categoryId' => $request->query('categoryId'),
            'search' => $request->query('search'),
            'veg' => $request->query('veg'),
            'popular' => $request->query('popular'),
            'bestSeller' => $request->query('bestSeller'),
        ];

        return response()->json($this->publicMenuService->getPublicMenuItems($filters));
    }
}
