"""
Model Registry - Phase 1 Implementation

ML model versioning, deployment, and A/B testing
Target: <10ms model lookup

Agent: ml-agent
Based on: IMPLEMENTATION_PLAN.md Month 3, Week 3-4
"""

import os
import json
import pickle
import hashlib
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
import sqlite3


class ModelStatus(Enum):
    """Model lifecycle status"""
    TRAINING = "training"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"
    DEPRECATED = "deprecated"


@dataclass
class ModelMetadata:
    """Model metadata"""
    model_id: str
    name: str
    version: str
    status: ModelStatus
    model_type: str  # 'dqn', 'random_forest', 'lstm', etc.

    # Performance metrics
    accuracy: float = 0.0
    win_rate: float = 0.0
    sharpe_ratio: float = 0.0
    total_pnl: float = 0.0

    # Deployment info
    created_at: datetime = None
    deployed_at: Optional[datetime] = None
    updated_at: datetime = None

    # Files
    model_path: str = ""
    config_path: str = ""

    # A/B testing
    traffic_percentage: float = 100.0  # % of requests to route to this model

    # Tags
    tags: List[str] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()
        if self.updated_at is None:
            self.updated_at = datetime.now()
        if self.tags is None:
            self.tags = []


class ModelRegistry:
    """
    ML Model Registry

    Features:
    - Model versioning
    - Performance tracking
    - A/B testing support
    - Model promotion (staging → production)
    - Model rollback
    """

    def __init__(self, registry_path: str = "models"):
        self.registry_path = registry_path
        self.db_path = os.path.join(registry_path, "registry.db")

        # Create registry directory
        os.makedirs(registry_path, exist_ok=True)

        # Initialize database
        self._init_db()

    def _init_db(self):
        """Initialize registry database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS models (
                model_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                status TEXT NOT NULL,
                model_type TEXT NOT NULL,
                accuracy REAL DEFAULT 0.0,
                win_rate REAL DEFAULT 0.0,
                sharpe_ratio REAL DEFAULT 0.0,
                total_pnl REAL DEFAULT 0.0,
                created_at TIMESTAMP,
                deployed_at TIMESTAMP,
                updated_at TIMESTAMP,
                model_path TEXT,
                config_path TEXT,
                traffic_percentage REAL DEFAULT 100.0,
                tags TEXT,
                UNIQUE(name, version)
            )
        """)

        conn.commit()
        conn.close()

    def register(
        self,
        name: str,
        version: str,
        model: Any,
        model_type: str,
        config: Optional[Dict] = None,
        metrics: Optional[Dict] = None,
        tags: Optional[List[str]] = None
    ) -> str:
        """
        Register a new model

        Args:
            name: Model name
            version: Model version
            model: Model object (will be pickled)
            model_type: Type of model ('dqn', 'rf', etc.)
            config: Model configuration
            metrics: Performance metrics
            tags: Model tags

        Returns:
            model_id
        """
        # Generate model ID
        model_id = hashlib.sha256(f"{name}:{version}:{datetime.now().isoformat()}".encode()).hexdigest()[:16]

        # Create model directory
        model_dir = os.path.join(self.registry_path, model_id)
        os.makedirs(model_dir, exist_ok=True)

        # Save model
        model_path = os.path.join(model_dir, "model.pkl")
        with open(model_path, 'wb') as f:
            pickle.dump(model, f)

        # Save config
        config_path = os.path.join(model_dir, "config.json")
        if config:
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)

        # Create metadata
        metadata = ModelMetadata(
            model_id=model_id,
            name=name,
            version=version,
            status=ModelStatus.STAGING,
            model_type=model_type,
            model_path=model_path,
            config_path=config_path,
            tags=tags or []
        )

        # Update metrics if provided
        if metrics:
            metadata.accuracy = metrics.get('accuracy', 0.0)
            metadata.win_rate = metrics.get('win_rate', 0.0)
            metadata.sharpe_ratio = metrics.get('sharpe_ratio', 0.0)
            metadata.total_pnl = metrics.get('total_pnl', 0.0)

        # Save to database
        self._save_metadata(metadata)

        print(f"[ModelRegistry] Registered {name} v{version} (ID: {model_id})")
        print(f"  Status: {metadata.status.value}")
        if metrics:
            print(f"  Win Rate: {metadata.win_rate:.2%}")
            print(f"  Sharpe Ratio: {metadata.sharpe_ratio:.2f}")

        return model_id

    def load(self, model_id: str) -> Optional[Any]:
        """Load model by ID"""
        metadata = self.get_metadata(model_id)
        if not metadata:
            return None

        with open(metadata.model_path, 'rb') as f:
            model = pickle.load(f)

        return model

    def get_metadata(self, model_id: str) -> Optional[ModelMetadata]:
        """Get model metadata"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM models WHERE model_id = ?", (model_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        return self._row_to_metadata(row)

    def list_models(
        self,
        name: Optional[str] = None,
        status: Optional[ModelStatus] = None,
        tags: Optional[List[str]] = None
    ) -> List[ModelMetadata]:
        """List models with filters"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        query = "SELECT * FROM models WHERE 1=1"
        params = []

        if name:
            query += " AND name = ?"
            params.append(name)

        if status:
            query += " AND status = ?"
            params.append(status.value)

        query += " ORDER BY created_at DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        models = [self._row_to_metadata(row) for row in rows]

        # Filter by tags
        if tags:
            models = [m for m in models if any(tag in m.tags for tag in tags)]

        return models

    def promote_to_production(self, model_id: str, traffic_percentage: float = 100.0):
        """
        Promote model to production

        Args:
            model_id: Model ID to promote
            traffic_percentage: Percentage of traffic to route (for A/B testing)
        """
        metadata = self.get_metadata(model_id)
        if not metadata:
            raise ValueError(f"Model {model_id} not found")

        # Update status
        metadata.status = ModelStatus.PRODUCTION
        metadata.deployed_at = datetime.now()
        metadata.traffic_percentage = traffic_percentage
        metadata.updated_at = datetime.now()

        self._save_metadata(metadata)

        print(f"[ModelRegistry] Promoted {metadata.name} v{metadata.version} to production")
        print(f"  Traffic: {traffic_percentage}%")

    def rollback(self, name: str):
        """
        Rollback to previous production model

        Args:
            name: Model name
        """
        # Get current production model
        current = self._get_production_model(name)
        if not current:
            raise ValueError(f"No production model for {name}")

        # Get previous version
        all_models = self.list_models(name=name)
        production_models = [m for m in all_models if m.status == ModelStatus.PRODUCTION]

        if len(production_models) < 2:
            raise ValueError("No previous version to rollback to")

        # Sort by deployed_at
        production_models.sort(key=lambda x: x.deployed_at, reverse=True)

        # Demote current
        current.status = ModelStatus.ARCHIVED
        current.updated_at = datetime.now()
        self._save_metadata(current)

        # Promote previous
        previous = production_models[1]
        previous.status = ModelStatus.PRODUCTION
        previous.traffic_percentage = 100.0
        previous.updated_at = datetime.now()
        self._save_metadata(previous)

        print(f"[ModelRegistry] Rolled back {name}")
        print(f"  From: v{current.version}")
        print(f"  To: v{previous.version}")

    def get_active_model(self, name: str) -> Optional[Any]:
        """
        Get active production model

        For A/B testing, randomly selects based on traffic percentage

        Args:
            name: Model name

        Returns:
            Model object or None
        """
        import random

        # Get all production models for this name
        models = self.list_models(name=name, status=ModelStatus.PRODUCTION)

        if not models:
            return None

        # A/B testing: select based on traffic percentage
        rand = random.random() * 100
        cumulative = 0

        for metadata in models:
            cumulative += metadata.traffic_percentage
            if rand <= cumulative:
                return self.load(metadata.model_id)

        # Fallback to first model
        return self.load(models[0].model_id)

    def _get_production_model(self, name: str) -> Optional[ModelMetadata]:
        """Get current production model metadata"""
        models = self.list_models(name=name, status=ModelStatus.PRODUCTION)
        return models[0] if models else None

    def _save_metadata(self, metadata: ModelMetadata):
        """Save metadata to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT OR REPLACE INTO models
            (model_id, name, version, status, model_type,
             accuracy, win_rate, sharpe_ratio, total_pnl,
             created_at, deployed_at, updated_at,
             model_path, config_path, traffic_percentage, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            metadata.model_id,
            metadata.name,
            metadata.version,
            metadata.status.value,
            metadata.model_type,
            metadata.accuracy,
            metadata.win_rate,
            metadata.sharpe_ratio,
            metadata.total_pnl,
            metadata.created_at,
            metadata.deployed_at,
            metadata.updated_at,
            metadata.model_path,
            metadata.config_path,
            metadata.traffic_percentage,
            json.dumps(metadata.tags)
        ))

        conn.commit()
        conn.close()

    def _row_to_metadata(self, row) -> ModelMetadata:
        """Convert database row to ModelMetadata"""
        return ModelMetadata(
            model_id=row[0],
            name=row[1],
            version=row[2],
            status=ModelStatus(row[3]),
            model_type=row[4],
            accuracy=row[5],
            win_rate=row[6],
            sharpe_ratio=row[7],
            total_pnl=row[8],
            created_at=datetime.fromisoformat(row[9]) if row[9] else None,
            deployed_at=datetime.fromisoformat(row[10]) if row[10] else None,
            updated_at=datetime.fromisoformat(row[11]) if row[11] else None,
            model_path=row[12],
            config_path=row[13],
            traffic_percentage=row[14],
            tags=json.loads(row[15]) if row[15] else []
        )


# Example usage
if __name__ == "__main__":
    print("[Demo] Model Registry\n")

    # Create registry
    registry = ModelRegistry()

    # Register a model (using a simple dict as demo)
    model_v1 = {"type": "dqn", "layers": [256, 128, 64], "version": "1.0"}

    model_id = registry.register(
        name="trading_dqn",
        version="1.0",
        model=model_v1,
        model_type="dqn",
        config={"learning_rate": 0.001, "gamma": 0.95},
        metrics={"win_rate": 0.62, "sharpe_ratio": 1.5, "total_pnl": 5000.0},
        tags=["dqn", "aapl"]
    )

    # Register v2 (better performance)
    model_v2 = {"type": "dqn", "layers": [512, 256, 128], "version": "2.0"}

    model_id_v2 = registry.register(
        name="trading_dqn",
        version="2.0",
        model=model_v2,
        model_type="dqn",
        metrics={"win_rate": 0.68, "sharpe_ratio": 1.8, "total_pnl": 8000.0},
        tags=["dqn", "aapl", "improved"]
    )

    # List all models
    print("\n[Demo] All models:")
    for model in registry.list_models():
        print(f"  {model.name} v{model.version} - {model.status.value}")
        print(f"    Win Rate: {model.win_rate:.2%}, Sharpe: {model.sharpe_ratio:.2f}")

    # Promote v2 to production
    print("\n[Demo] Promoting v2 to production...")
    registry.promote_to_production(model_id_v2)

    # Get active model
    print("\n[Demo] Loading active model...")
    active_model = registry.get_active_model("trading_dqn")
    print(f"  Active model: {active_model}")

    print("\n[Demo] Features implemented:")
    print("  ✓ Model versioning")
    print("  ✓ Performance metrics tracking")
    print("  ✓ Model promotion (staging → production)")
    print("  ✓ A/B testing support (traffic routing)")
    print("  ✓ Model rollback")
    print("  ✓ Model persistence (pickle)")
    print("\n[Demo] Target: <10ms model lookup")
    print("[Demo] Ready for production ML deployment!")
